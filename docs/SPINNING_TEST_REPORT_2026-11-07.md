# Relatório de testes — Spinning Studio

**Executado:** 2026-11-07  
**Base:** PR #2, branch `feat/spinning-studio-ai`  
**Status:** testes de lógica e simulação aprovados; build e homologação de dispositivo **pendentes**.

## Resultados executados

| Verificação | Resultado | Escopo |
|---|---|---|
| 225 asserts das funções de Spinning | 225/225 aprovados | Durações, fases, RPE, templates, contrato de IA, validação e URLs |
| Teste simulado da API da IA | Aprovado | 401 sem login, 400 input inválido, 403 sem consentimento, 503 IA desligada, 202 job, 404 job incorreto, status de proposta, 429 cota diária |
| Falha do fornecedor | Aprovado | Falha reportada sem vazar diagnóstico bruto do provedor |
| Imports relativos | 20/20 resolvidos | Verificação cruzada dos novos arquivos com a árvore da branch |
| Ícones estáticos | 5/5 existentes | Glyphs usados diretamente nas novas telas |
| Seletores CSS reutilizados | Presentes | `.item`, `.grow`, `.tt`, `.ss`, `.lrow` |

### Metodologia e limites

O teste foi feito em um executor JavaScript isolado sobre o **texto-fonte recuperado do GitHub**, com injeção de dependências simuladas onde necessário. Como esse executor não oferece a API global de URL de navegador, foi utilizada uma implementação de teste para validar o comportamento esperado de parsing e allowlist.

**Estes testes não substituem** `npm ci`, Vitest completo, `npm run build`, testes da API com Node real nem um navegador/mobile real. A simulação da API não executa provedores de IA pagos, WebAuthn, disco real, PostgreSQL ou um servidor HTTP de produção.

## Bloqueios de homologação

- [ ] Rodar `npm ci && npm test && npm run build && node scripts/check-locales.mjs` em `frontend/`.
- [ ] Rodar `npm test` em `api/` e `node scripts/build-coach-library.mjs --check`.
- [ ] Confirmar CI do GitHub Actions (nenhuma execução visível para o PR até a checagem).
- [ ] Testar no browser real com sessão autenticada e AI Coach configurado.
- [ ] Validar iPhone e Android: áudio externo, foco, bloqueio/reabertura, voz sintetizada, pausa e sincronização.
- [ ] Revisão de QA e segurança antes de retirar o PR do modo draft.
- [ ] Confirmar direitos de execução pública no cenário de uso comercial da música.

## Decisão

Não fazer merge na `main` até concluir os testes completos de build, integração e dispositivo real. A branch continua disponível para revisão.

Relatório não afirma que o aplicativo foi implantado ou que a integração IA foi exercitada contra um provedor real.
