# Melhorias — gym (openGym)

## Pendências

- [ ] Validar fix de i18n em ambiente de deploy real: bloquear request do
  chunk de locale via DevTools antes/depois do fix (`i18n.js`/`main.jsx`,
  commit 078e2a1) e confirmar que resolve o sintoma relatado (biblioteca em
  inglês na primeira carga pós-deploy).
- [ ] PR #1 (https://github.com/brizziinfinite/opengym/pull/1) — mergeado
  localmente na main a pedido do usuário nesta sessão; fechar o PR remoto no
  GitHub quando conveniente (fica órfão, sem conflito, mas visualmente aberto).
- [ ] Suite de testes tem 1 falha pré-existente não relacionada ao trabalho
  desta sessão: `src/lib/coach.test.js` falha por dependência ausente
  (`@anthropic-ai/claude-agent-sdk` não instalada em `api/coach/adapters`).
  Não investigado — fora do escopo do bug de i18n.

## Concluído

- [x] Fix bug i18n primeira carga (locale pack import falho não travava
  corretamente) — 2026-09-29, commit 078e2a1, branch
  `fix-i18n-primeira-carga-library` mergeada na main.
