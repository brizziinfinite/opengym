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
- [ ] Progressão de carga nas mensagens: sugerir a carga de hoje (usar a lógica de `frontend/src/lib/progression.js`) em vez de só "última: X kg"
- [ ] Versão curta de 15 minutos quando a pessoa diz que não consegue treinar
- [ ] Áudio: aceitar mensagem de voz ("fiz tudo, supino com 40") via Gemini
- [ ] Web: usuários do WhatsApp veem aviso "seu plano é gerenciado pelo WhatsApp" ao editar rotinas
- [ ] Painel admin: listar usuários do WhatsApp, etapa do cadastro e opt-outs
- [ ] Migrar para WhatsApp Cloud API (oficial) quando passar de ~100 usuários — só `api/wa/evolution.js` muda

## Baixa Prioridade / Backlog
- [ ] Lembrete de hidratação/sono opcional
- [ ] Desafios semanais e metas por grupo (família/amigos)
- [ ] Ícone maskable com área de segurança revisada para Android
