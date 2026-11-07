# Spinning Studio — execução em branch isolada

Branch: `feat/spinning-studio-ai` (não publicar em produção antes de revisar e testar).

## Decisões de produto

- Spinning é um módulo do Gyn/Levanta, não um novo aplicativo.
- O áudio **não** é reproduzido, espelhado ou controlado pelo Gyn na primeira versão.
- Professores podem abrir um serviço de música externo, mas a execução pública exige direitos próprios; contas pessoais não substituem licenças.
- O cronômetro da aula é manual e **não** acompanha automaticamente cada música.
- As quatro sugestões musicais existentes são metadados editoriais; não constituem catálogo licenciado, nem comprovam disponibilidade.
- A IA deverá propor roteiros; o professor aprova. O motor determinístico calcula duração e transições.

## Fase 1 — Fundação funcional (nesta branch)

- [x] Quatro programas iniciais com etapas e sugestões de faixas.
- [x] Página `/spinning` e card de acesso na Home, sem mudar a barra inferior.
- [x] Cadência alvo (RPM), esforço subjetivo (RPE), orientações e cronômetro.
- [x] Pausar, retomar e salvar sessão em `S.spinning`.
- [x] Reaproveitar Wake Lock, som/vibração e sincronização do perfil.
- [x] Testes de timeline, duração e pausas.
- [ ] Verificar GitHub Actions (Vitest, build e i18n) em PR draft.
- [ ] Validar navegação, toque e legibilidade em iPhone e Android reais.

### Modelo de dados atual

```js
S.spinning = {
  active: { classId, elapsedSec, running, runningSince, startedAt } | null,
  history: [{ id, classId, title, startedAt, endedAt, seconds }]
}
```

A implementação evita alterar o contrato de treinos de musculação (`S.workouts`).
A integração de estatísticas gerais precisará tratar ambos os tipos explicitamente, sem inventar volume muscular.

## Fase 2 — IA na criação de aulas (próxima alteração, antes de lançamento)

**Reaproveitar o provedor administrado pelo AI Coach**, mas criar rota e contrato específicos de spinning. Não usar a rota `/api/coach/plan`, pois ela valida treinos de musculação.

Fluxo proposto:

1. Professor informa duração (30/45/50/60 min), gênero musical, nível e objetivo.
2. API autenticada exige opt-in específico para IA, usa caps e adaptadores isolados já existentes.
3. O provedor gera **somente JSON estruturado**; nenhum acesso externo a músicas é necessário.
4. Validação determinística aplica limites de RPM/RPE, duração total, etapas e texto. Propostas inválidas são rejeitadas.
5. Resultado é uma **prévia editável**. Só uma aprovação explícita salva a aula.
6. Dados enviados à IA devem ser mínimos: preferências da aula, sem histórico ou dados de saúde de alunos por padrão.
7. Os programas manuais continuam disponíveis quando o provedor de IA estiver offline.

Contrato sugerido:

```json
{
  "title": "Spinning 80/90 Dance",
  "durationSeconds": 3000,
  "style": "dance-8090",
  "phases": [
    { "name": "Aquecimento", "seconds": 600, "rpmMin": 65, "rpmMax": 80, "rpe": 3, "cue": "..." }
  ],
  "musicQueries": [{ "title": "...", "artist": "..." }]
}
```

## Fase 3 — Música e sincronização opcional

- Vincular URLs de playlists fornecidas pelo professor, sem assumir autorização comercial.
- Música sempre por player externo na configuração básica.
- Não integrar a API/Web Playback SDK do Spotify para aula comercial sem aprovação específica do fornecedor.
- Só implementar reprodução interna depois de validar catálogo, país, contrato e licenças.
- Sincronização por faixa requer timestamps reais do player autorizado; nunca simular precisão.

## Definição de pronto

- [ ] Fase 1 passa Vitest e build.
- [ ] Nenhuma alteração na `main` sem PR revisado.
- [ ] Pausa e retomada não duplicam sessões.
- [ ] Sessões persistem no modo guest, PWA e sincronização autenticada.
- [ ] Não há áudio embutido, chaves ou tokens de Spotify.
- [ ] A IA nunca grava plano sem revisão humana.
- [ ] App continua útil sem IA e sem internet.

## Economia de tokens no ambiente do agente

Caveman Lite e TKR são utilitários de **processo de desenvolvimento**, não módulos para instalar no frontend/API do Gyn. Ativá-los no agente/terminal do desenvolvedor, se já estiverem instalados, fora do runtime de produção.

- Caveman: selecionar modo `lite` usando o comando da versão instalada (por exemplo `/caveman lite`).
- TKR: conferir `tkr status`; no Codex, setup/hook dependem da distribuição instalada. Não modificar a configuração global do desenvolvedor nem instalar versões desconhecidas pelo CI.
- Nenhum destes utilitários substitui testes, validação de IA ou revisão de segurança.
