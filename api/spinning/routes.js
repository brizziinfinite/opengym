// AI-backed class generator. Asynchronous job avoids browser/reverse-proxy request
// timeouts. Jobs are scoped to one signed-in user and never overwrite their plan.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cfgStore from '../coach/config.js';
import { adapterFor } from '../coach/adapters/index.js';
import { unprivilegedIds } from '../coach/adapters/spawn.js';
import { extractJSON } from '../coach/validate.js';
import { validateRequest, validateClass, buildPrompt } from './contract.js';

const jobs = new Map();
const usage = new Map();
const MAX_DAILY = 3;
const MAX_CONCURRENT = 2;
const JOB_TTL = 20 * 60000;

const dayKey = () => new Date().toISOString().slice(0, 10);
const quota = uid => {
  const rec = usage.get(uid);
  return rec?.day === dayKey() ? rec.count : 0;
};
const charge = uid => {
  const today = dayKey();
  const prior = usage.get(uid);
  usage.set(uid, { day: today, count: prior?.day === today ? prior.count + 1 : 1 });
  if (usage.size > 2000) usage.clear();
};
const running = () => [...jobs.values()].filter(j => j.state === 'queued' || j.state === 'running').length;

function compactJobs() {
  for (const [uid, j] of jobs) {
    if (j.updatedAt < Date.now() - JOB_TTL && j.state !== 'running' && j.state !== 'queued') jobs.delete(uid);
  }
}

async function generate(uid, job) {
  job.state = 'running';
  job.updatedAt = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-ai-'));
  try {
    const cfg = cfgStore.load();
    const adapter = adapterFor(cfg.provider);
    if (!adapter) throw new Error('AI provider unavailable');
    const ids = unprivilegedIds();
    if (ids) fs.chownSync(dir, ids.uid, ids.gid);
    const output = await adapter.invoke({
      cfg, prompt: buildPrompt(job.request), jobDir: dir, env: cfgStore.jobEnv(dir),
      model: cfg.model || null, timeoutMs: 120000
    });
    if (output.timedOut) throw new Error('A IA demorou mais do que o permitido.');
    if (output.spawnError || output.code !== 0) throw new Error('Não foi possível executar o provedor de IA.');
    const parsed = extractJSON(output.text);
    if (parsed.error) throw new Error('A IA retornou dados ilegíveis.');
    const validated = validateClass(parsed.value, job.request.duration);
    if (!validated.ok) throw new Error('O roteiro não passou pela validação: ' + validated.errors.slice(0, 2).join(', '));
    const maxEffort = job.request.level === 'light' ? 4 : job.request.level === 'moderate' ? 6 : 7;
    if (validated.value.phases.some(p => p.rpe > maxEffort)) throw new Error('O roteiro ultrapassou a intensidade definida.');
    job.state = 'ready';
    job.proposal = validated.value; // suggestion only: saving always requires approval in the UI
  } catch (e) {
    job.state = 'failed';
    // Never expose stdout, command args, secrets, or provider diagnostics to clients.
    job.error = [
      'A IA demorou mais do que o permitido.',
      'Não foi possível executar o provedor de IA.',
      'A IA retornou dados ilegíveis.',
      'O roteiro ultrapassou a intensidade definida.'
    ].includes(e.message) || e.message?.startsWith('O roteiro não passou pela validação:')
      ? e.message : 'Falha na geração da aula. Verifique o provedor de IA.';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    job.updatedAt = Date.now();
    delete job.request;
  }
}

export function spinningRoutes({ json, readBody, readSession, readState }) {
  return {
    'POST /api/spinning/generate': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'Faça login para usar a IA.' });
      const request = validateRequest(await readBody(req));
      if (!request.ok) return json(res, 400, { error: request.error });
      const S = readState(user.id);
      if (!S?.spinning?.aiConsent?.agreedAt || S.spinning.aiConsent.version !== 1) {
        return json(res, 403, { error: 'Autorize o uso de IA antes de gerar aulas.' });
      }
      if (!cfgStore.isEnabled() || !cfgStore.isConnected()) return json(res, 503, { error: 'O provedor de IA ainda não está configurado.' });
      compactJobs();
      if (jobs.get(user.id)?.state === 'running' || jobs.get(user.id)?.state === 'queued') {
        return json(res, 409, { error: 'Sua aula ainda está sendo gerada.' });
      }
      if (running() >= MAX_CONCURRENT) return json(res, 429, { error: 'A IA está ocupada. Tente novamente.' });
      if (quota(user.id) >= MAX_DAILY) return json(res, 429, { error: 'Limite diário de IA alcançado.' });
      charge(user.id);
      const job = { id: crypto.randomBytes(12).toString('hex'), state: 'queued', request, updatedAt: Date.now() };
      jobs.set(user.id, job);
      // Fire-and-forget is safe here: generate catches provider errors and records a sanitized status.
      queueMicrotask(() => { generate(user.id, job).catch(() => {
        job.state = 'failed'; job.error = 'Falha interna na geração.'; job.updatedAt = Date.now();
      }); });
      return json(res, 202, { job: { id: job.id, state: job.state } });
    },

    'GET /api/spinning/status': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'Faça login para consultar a aula.' });
      compactJobs();
      const id = new URL(req.url, 'http://localhost').searchParams.get('job');
      const job = jobs.get(user.id);
      if (!job || job.id !== id) return json(res, 404, { error: 'Geração não encontrada ou expirada.' });
      return json(res, 200, {
        job: { id: job.id, state: job.state, ...(job.error ? { error: job.error } : {}) },
        ...(job.state === 'ready' ? { proposal: job.proposal, requiresApproval: true } : {})
      });
    }
  };
}
