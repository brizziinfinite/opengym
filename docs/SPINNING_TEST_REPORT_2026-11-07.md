# Relatório de testes — Spinning Studio (execução real)

**Data:** 2026-11-07  
**Branch:** `feat/spinning-studio-ai` — PR #2  
**Commit testado:** `35ed41723db35cbfa81db847521cbabfa2c2f931`  
**Executor:** Vercel Sandbox Linux isolado, com checkout GitHub; Node.js v24.22.1 (a configuração do GitHub Actions usa Node 22).  
**Publicação:** nenhuma; `main` não modificada.

## Suítes executadas sobre o checkout da branch

| Comando | Resultado |
|---|---|
| `frontend: npm ci` | OK |
| `api: npm ci` | OK |
| `frontend: npm test` (Vitest) | **228/228 passaram**, 13 arquivos |
| `frontend: npm run build` (Vite) | **OK** |
| `frontend: node scripts/check-locales.mjs` | **11 idiomas, 860 chaves, sincronizados** |
| `api: npm test` (node:test) | **76 passaram, 0 falhas, 1 ignorado** (77 no total) |
| `node scripts/build-coach-library.mjs --check` | **OK**, 1.324 exercícios |
| `git status --short` após os testes | checkout limpo |

### Falhas pré-existentes descobertas e corrigidas

A API tinha 5 falhas na branch e as mesmas 5 na `main`. O fixture padrão do Coach guardava treinos em **2026-07-20**; conforme o calendário avançou, eles ficaram fora da janela móvel de 12 semanas do review. O helper agora gera datas relativas ao dia do teste. Após essa correção, as 5 falhas desapareceram.

### Problema real do CI também corrigido

Em um ambiente limpo, os testes do frontend falharam ao importar `@anthropic-ai/claude-agent-sdk` da API, porque o workflow instalava apenas dependências do frontend. A configuração `.github/workflows/test.yml` agora executa `npm ci` na API antes dos testes do frontend, e executa `npm ci` no job específico da API.

Reproduzimos a falha em instalação limpa e, após instalar as dependências corretamente, as suítes passaram.

### Cobertura específica do Spinning

- 4 programas e validação de fases, duração e cronômetro
- Editor, intensidade e permissão dos links externos
- Contrato de IA e rejeição de dados inválidos
- **Novo teste real de rota**: login obrigatório, consentimento, geração assíncrona, isolamento entre professores, cota diária e falhas sanitizadas, com o fixture CLI real (sem consumo de créditos de IA)
- Regra de aprovação humana antes de salvar o roteiro

## Pendências antes de retirar PR do modo draft

1. **GitHub Actions hospedado:** consultas ao GitHub ainda retornaram **zero execuções** do evento `pull_request` para o repositório. Os testes foram executados num runner externo isolado, não nos runners do GitHub. Verificar em Settings > Actions > General se Actions está habilitado e autoriza os workflows; não há permissão/tool conectado para alterar essa configuração nesta sessão.
2. **Versão de Node do CI:** runner isolado utilizou Node 24. O arquivo de workflow especifica Node 22, coerente com Docker; confirmar num GitHub runner ou num container Node 22 quando possível.
3. **Teste em celular real:** iOS/Android, áudio externo, bloqueio/retomada, alertas e síntese de voz.
4. **Provedor IA real:** autenticação válida e geração de uma aula de ponta a ponta; o teste de rota acima usa provedor fixture, não conta paga.
5. **Imagem Docker da API:** job `api-image` existe no GitHub Actions, mas não foi executado no sandbox.
6. **Licenciamento musical:** nenhuma execução pública comercial é autorizada por uma assinatura pessoal.

### Avisos não bloqueantes

- O build Vite apresenta aviso de chunks grandes; **não** é erro de compilação.
- O teste de PostgreSQL foi ignorado porque `PG_TEST_URL` não estava configurado; esse banco não foi exercitado neste teste.

**Conclusão:** testes de frontend, build, i18n, contratos, API e integração fixture passaram. Mantenha PR #2 em rascunho até concluir a execução GitHub-hosted, o QA mobile e a integração real de IA.
