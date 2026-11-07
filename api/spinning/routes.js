// Authenticated Spinning AI endpoint. Reuses the configured AI Coach provider without
// exposing provider credentials or accessing strength-training history.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cfgStore from '../coach/config.js';
import { adapterFor } from '../coach/adapters/index.js';
import { unprivilegedIds } from '../coach/adapters/spawn.js';
import { extractJSON } from '../coach/validate.js';
import { validateRequest, validateClass, templateClass, buildPrompt } from './contract.js';

const busy = new Set();
const recent = new Map();
const MAX_DAILY = 3;

const withinQuota = (uid, date) => {
  const item = recent.get(uid);
  return (item && item.date === date) ? item.count < MAX_DAILY : true;
};
const recordRequest = (uid, date) => {
  const item = recent.get(uid);
  recent.set(uid, { date, count: (item && item.date === date ? item.count : 0) + 1 });
  if (recent.size > 2000) recent.clear();
};

export function spinningRoutes({ json, readBody, readSession, readState }) {
  return {
    'POST /api/spinning/generate': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'Sign in to generate a class' });
      const body = await readBody(req);
      const args = validateRequest(body);
      if (!args.ok) return json(res, 400, { error: args.error });

      // Consent must be in the persisted server state, not just a client-submitted toggle.
      const saved = readState(user.id);
      if (!saved?.spinning?.aiConsent?.agreedAt || saved.spinning.aiConsent.version !== 1) {
        return json(res, 403, { error: 'Explicit Spinning AI consent required' });
      }
      if (!cfgStore.isEnabled() || !cfgStore.isConnected()) return json(res, 503, { error: 'AI Coach provider not configured' });
      if (busy.has(user.id)) return json(res, 409, { error: 'A class is already generating' });

      const date = new Date().toISOString().slice(0, 10);
      if (!withinQuota(user.id, date)) return json(res, 429, { error: 'Daily Spinning AI limit reached' });
      busy.add(user.id);
      recordRequest(user.id, date);

      const config = cfgStore.load();
      const adapter = adapterFor(config.provider);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-ai-'));
      try {
        const ids = unprivilegedIds();
        if (ids) fs.chownSync(dir, ids.uid, ids.gid);
        const env = cfgStore.jobEnv(dir);
        const provider = await adapter.invoke({
          cfg: config, prompt: buildPrompt(args), jobDir: dir, env,
          model: config.model || null, timeoutMs: 120000
        });
        if (provider.timedOut) return json(res, 504, { error: 'AI class generation timed out' });
        if (provider.spawnError || provider.code !== 0) return json(res, 502, { error: 'AI provider unavailable' });
        const parsed = extractJSON(provider.text);
        if (parsed.error) return json(res, 422, { error: 'AI returned unreadable data' });
        const checked = validateClass(parsed.value, args.duration);
        if (!checked.ok) return json(res, 422, { error: 'AI class did not pass validation', reasons: checked.errors.slice(0, 8) });

        const ceiling = args.level === 'light' ? 4 : args.level === 'moderate' ? 6 : 7;
        if (checked.value.phases.some(p => p.rpe > ceiling)) {
          return json(res, 422, { error: 'AI exceeded requested intensity' });
        }
        json(res, 200, { proposal: checked.value, requiresApproval: true, provider: config.provider });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        busy.delete(user.id);
      }
    }
  };
}
