# Melhorias — Levanta

## Alta Prioridade
- [ ] Testar o assistente com Evolution API e Gemini reais (fotos dos aparelhos e registro por texto livre) — até agora testado em modo simulado
- [ ] Página de privacidade (LGPD art. 11): o que é guardado, por quê, e como apagar — o consentimento no WhatsApp deve apontar para ela
- [ ] Revisão dos modelos de plano (`api/wa/plan.js`) por profissional com CREF (Lei 9.696/98)
- [ ] Checar marca "Levanta" no INPI antes de divulgar
- [x] ~~Cadastro por conversa no WhatsApp (consentimento, PAR-Q, condições, corpo, objetivo, nível, local, fotos, horário)~~ 2026-09-29
- [x] ~~Mensagem diária com treino + benefício, check-in, resumo semanal e mensal~~ 2026-09-29
- [x] ~~Rebrand: nome Levanta e ícone novo~~ 2026-09-29

## Média Prioridade
- [x] ~~Parada de emergência (dor no peito, tontura…), limite de 3 dias para iniciante, caminhadas, condições novas (ombro, osteoporose, quadril, labirintite, evento recente, câncer)~~ 2026-09-29
- [x] ~~COMO n envia a animação; testes funcionais mensais; sequência semanal; modo silencioso após 14 dias sem resposta~~ 2026-09-29
- [x] ~~Bug: dia remarcado pelo WhatsApp era apagado pelo app web; fotos reduzidas (sharp, sem EXIF); backup diário~~ 2026-09-29
- [x] ~~Postgres (container no compose): usuários, perfis WhatsApp, mensagens, eventos, consentimentos, resumo por usuário; migração automática do db.json~~ 2026-09-29
- [ ] Postgres fase 2: `user_state` jsonb com versão otimista no lugar dos arquivos state-*.json; agendador por query
- [x] ~~Progressão de carga nas mensagens: carga-alvo do dia calculada; FIZ sem números não sobe; esforço 1–5 decide~~ 2026-09-29
- [ ] Versão curta de 15 minutos quando a pessoa diz que não consegue treinar (hoje: remarca para amanhã e sugere os 2 primeiros exercícios)
- [ ] Áudio: aceitar mensagem de voz ("fiz tudo, supino com 40") via Gemini
- [ ] Web: usuários do WhatsApp veem aviso "seu plano é gerenciado pelo WhatsApp" ao editar rotinas
- [ ] Painel admin: listar usuários do WhatsApp, etapa do cadastro e opt-outs
- [ ] Migrar para WhatsApp Cloud API (oficial) quando passar de ~100 usuários — só `api/wa/evolution.js` muda

## Baixa Prioridade / Backlog
- [ ] Lembrete de hidratação/sono opcional
- [ ] Desafios semanais e metas por grupo (família/amigos)
- [ ] Ícone maskable com área de segurança revisada para Android
