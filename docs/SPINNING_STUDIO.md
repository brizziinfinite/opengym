# Spinning Studio — execução em branch isolada

Branch: `feat/spinning-studio-ai` (não publicar em produção antes de revisar e testar).

## Decisões de produto

- Spinning é um módulo do Gyn/Levanta, não um novo aplicativo.
- **Decisão reafirmada em 2026-11-07:** manter o Spotify como serviço externo, com uma passagem simples pelo Gyn, análoga a um checkout externo bem integrado na experiência do usuário. Isso **não** significa player invisível embutido, reprodução pelo Gyn, controle de Spotify ou autorização comercial.
- O professor vincula manualmente uma URL HTTPS de playlist a uma aula personalizada; a biblioteca exibe **Playlist** somente quando existe link válido. O professor abre o Spotify oficial, retorna ao Gyn e inicia o relógio da aula. A aplicação não transmite credenciais, não mantém OAuth nem grava conteúdo musical do Spotify.
- Personalizar uma das quatro aulas-padrão salva uma **nova cópia identificada por `spin-...`**, evitando substituir ou duplicar identificadores das aulas de fábrica.
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

A implementação evita alterar o contrato de treinos de musculação (`S.workouts`). Os minutos de spinning já entram nos indicadores próprios e no heatmap de atividades, sem inventar volume muscular.

As aulas personalizadas são armazenadas em `S.spinning.classes`, com histórico em `S.spinning.history` e consentimento da IA em `S.spinning.aiConsent`. Os modos Professor e Aluno compartilham o mesmo motor de aula.

## Fase 2 — IA na criação de aulas (implementação nesta branch; validação pendente)

**Reaproveitar o provedor administrado pelo AI Coach**, mas criar rota e contrato específicos de spinning. Não usar a rota `/api/coach/plan`, pois ela valida treinos de musculação.

Fluxo implementado:

1. Professor informa duração (30/45/50/60 min), gênero musical e nível.
2. API autenticada exige consentimento de IA salvo no servidor; limita 3 solicitações por usuário/dia e 2 simultâneas. Reutiliza os adaptadores isolados já existentes.
3. O provedor gera **JSON estruturado** em uma tarefa assíncrona; `/api/spinning/generate` retorna 202 e `/api/spinning/status?job=...` fornece o resultado; nenhum acesso a catálogo externo é feito.
4. Validação determinística aplica limites de RPM/RPE, duração total, etapas e texto. Propostas inválidas são rejeitadas.
5. Resultado é uma **prévia editável**. Só uma aprovação explícita salva a aula.
6. Dados enviados à IA devem ser mínimos: preferências da aula, sem histórico ou dados de saúde de alunos por padrão.
7. Os programas manuais continuam disponíveis quando o provedor de IA estiver offline.

Contrato utilizado (campos principais):

```json
{
  "title": "Spinning 80/90 Dance",
    "phases": [
    { "name": "Aquecimento", "seconds": 600, "rpmMin": 65, "rpmMax": 80, "rpe": 3, "cue": "..." }
  ],
  "tracks": [{ "title": "...", "artist": "..." }]
}
```

## Fase 3 — Música e sincronização opcional

- [x] Vincular URLs HTTPS de playlists fornecidas pelo professor, sem assumir autorização comercial.
- [x] Simplificar a passagem para o Spotify com botão de playlist junto à aula, sem link genérico enganoso e com personalização não destrutiva dos presets.
- [x] Música por player externo na configuração básica. A interface oferece acesso ao Spotify/Apple Music, mas não controla o áudio.
- Não integrar a API/Web Playback SDK do Spotify para aula comercial sem aprovação específica do fornecedor.
- Só implementar reprodução interna depois de validar catálogo, país, contrato e licenças.
- Sincronização por faixa requer timestamps reais do player autorizado; nunca simular precisão.

## Definição de pronto

- [ ] Executar Vitest e build no CI; há testes no repositório e 48 verificações puras feitas sobre o código publicado na branch.
- [x] Nenhuma alteração na `main`; PR #2 é rascunho para revisão.
- [ ] Pausa e retomada não duplicam sessões.
- [ ] Sessões persistem no modo guest, PWA e sincronização autenticada.
- [x] Não há áudio embutido, chaves ou tokens de Spotify.
- [x] A IA apenas gera uma prévia; o professor revisa e salva explicitamente.
- [x] Quatro programas e templates continuam disponíveis sem IA. Verificar offline em dispositivo real.

## Economia de tokens no ambiente do agente

Caveman Lite e TKR são utilitários de **processo de desenvolvimento**, não módulos para instalar no frontend/API do Gyn. Ativá-los no agente/terminal do desenvolvedor, se já estiverem instalados, fora do runtime de produção.

- Caveman: seguir a versão instalada; verificar modo e hook na sessão do Claude Code, conforme `docs/DEVELOPMENT_SESSION_TOOLS.md`.
- TKR: conferir `tkr doctor` e `tkr status` na máquina do desenvolvedor. Não alterar configuração global sem autorização.
- Nenhum destes utilitários substitui testes, validação de IA ou revisão de segurança.


## Limitações verificadas

- Os jobs de IA ficam em memória no backend (20 min após finalização). Reiniciar o servidor durante uma geração cancela a possibilidade de recuperar o resultado; uma fila persistente seria evolução futura.
- O navegador consulta o status do job enquanto o editor está aberto; sair da tela pode exigir iniciar nova consulta, mas nunca grava sugestões sem aprovação.
- A primeira versão não sincroniza mudanças de música/refrões; orientações são baseadas no relógio da aula.
- A voz automática usa síntese do navegador, desligada por padrão; pode interferir no áudio externo e exige teste em dispositivos.
- GitHub Actions ainda não apresentou execuções para o PR; não declarar produção ou entrega aprovada antes de rodar testes de frontend/API e teste manual mobile.
