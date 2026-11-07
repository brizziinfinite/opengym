# Sessões de desenvolvimento — Caveman + TKR

O Gyn não instala nem executa essas ferramentas em produção. Elas operam na máquina do desenvolvedor e dentro das sessões dos agentes. Configuração global requer aprovação do proprietário.

## Claude Code (preferido)

Dentro do Claude Code:

```text
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman

/plugin marketplace add bpeers01/tkr-releases
/plugin install tkr
```

Reinicie a sessão após a instalação. Não há comando para acionar plugins em sessões remotas de outro ambiente a partir do GitHub.

No terminal dessa máquina:

```sh
command -v tkr
tkr doctor
tkr status
```

As versões atuais do Caveman usam o modo padrão `caveman`; o nome histórico `lite` é tratado como alias, não como um modo distinto. Prefira o modo padrão não telegráfico, preservando avisos e comandos técnicos. O TKR deve comprimir saídas de ferramentas; não acumular dois redutores de verbosidade sobre o mesmo texto, se possível.

Para iniciar sessões novas com TKR:
```sh
tkr claude
```

Conforme a versão instalada, hooks nativos também podem ser habilitados com `tkr init -g`. Verifique com `tkr doctor`. Não execute `init` cegamente se os hooks do plugin já estiverem ativos.

## Codex CLI / VS Code

No terminal do Mac no ambiente Codex:

```sh
npx -y github:JuliusBrussee/caveman -- --only codex
tkr init --codex
```

Abra o Codex CLI e revise/autorize os hooks usando `/hooks`. O comando `$caveman` solicita a skill sob demanda. A integração TKR/Codex é experimental; verificar logs e diagnósticos na própria máquina. Instalação no Mac não se propaga a outro container/SSH.

## Verificação obrigatória

Antes de anunciar "ativado", registrar evidências: saída de `tkr doctor`, `tkr status`, verificação dos hooks no agente, Caveman listado nas skills/plugins, e uma nova sessão realmente usando-os.

Comandos e referências oficiais (consultados em 2026-11-07):
- https://github.com/JuliusBrussee/caveman/blob/main/INSTALL.md
- https://github.com/bpeers01/tkr-releases
