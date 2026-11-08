# Levanta / Gyn — Mobile Glass UI

## Objetivo e escopo

Refinar o frontend existente, sem substituição da arquitetura, para que o Gyn tenha uma identidade mobile-first reconhecível: **frosted glass, profundidade controlada, cor concentrada no CTA, tipografia legível e navegação com alcance do polegar**.

Branch de design: `feat/gyn-glass-mobile-ui`, originada em `feat/spinning-studio-ai`. Não inclui merge na `main`, implantação, conexão com serviços musicais ou alteração de dados.

## Referências visuais (inspiração, não cópia)

- [VoltFit — Dribbble](https://dribbble.com/shots/27770882-VoltFit-Fitness-App-Mobile-UI-Design): cores escuras com acento vivo e visualização rápida.
- [Fit Club — Dribbble](https://dribbble.com/shots/27336516-Fit-Club-Fitness-App-UI-Design): hierarquia, gradientes suaves e cartões translúcidos.
- [CardioCraze — Dribbble](https://dribbble.com/shots/24454590-Mobile-App-CardioCraze-Glassmorphism-UI-Design): camadas de vidro e organização mobile.

As referências não foram copiadas como imagens, código ou assets.

## Implementado

- **Design tokens:** paleta noite azulada (mantendo o acento escolhido pelo usuário), bordas especulares, blur e sombras moderadas; versão clara mantida.
- **Camada global:** cards, listas, botões, inputs, grupos e tiles com superfícies translúcidas legíveis; fallback sólido em navegadores sem backdrop-filter, para contraste elevado ou transparência reduzida.
- **Navegação:** dock glass flutuante, respeito a `safe-area-inset-bottom`, área mínima de toque e `aria-current` para aba ativa.
- **Home:** cartão de foco com treino real do dia, início/retomada, métricas de semana e atalhos; componente de Spinning responsivo.
- **Spinning Studio:** abertura com identidade visual, cartões de aulas com mini linha de etapas, ações separadas para Personalizar / Playlist / Iniciar, cronômetro em anel, KPIs RPM e RPE ampliados, orientação do professor destacada.
- **Editor:** rolagem automática para o editor aberto, respeitando preferência de redução de movimento.
- **Spotify:** continua **externo**. Apenas abre links HTTPS de playlists fornecidas pelo professor. Nenhum player, OAuth, download, transmissão, sincronização de música ou alegação de licenciamento foi adicionado.

## Padrões e limites

- Não esconder textos em camadas translúcidas, não depender de imagem de fundo para leitura.
- Ações primárias grandes, alvos com espaço no móvel e ícones do sistema existente.
- Manter treino de força, plano, AI Coach, histórico, configurações e dados intactos.
- Não alterar o conteúdo dos programas de spinning nem a lógica de autorização/IA.
- `prefers-reduced-motion` e `prefers-reduced-transparency` / `prefers-contrast` com fallbacks.
- Sem dependências de UI adicionais nem fontes proprietárias externas.

## Verificações

Execução inicial da branch em sandbox Linux isolado:
- Vitest frontend: **228/228 passaram**.
- Build Vite: **passou**.
- API: **76 passaram; 0 falhas; 1 ignorado** (teste de banco sem `PG_TEST_URL`).
- Locales: **11 idiomas, 860 chaves** sincronizados.
- Catálogo Coach: **1.324** itens sincronizados.
- Playwright Chromium em modo de demonstração: **320/375/390/430 px**, Home, biblioteca Spinning e aula em andamento; **sem overflow horizontal nem erros de página**.
- As renderizações de navegador automatizado **não substituem** homologação manual no iPhone/Android, especialmente áudio externo, gesto, teclado e voice synthesis.

## Próximo gate de release

- [ ] Conferir o visual e usabilidade num iPhone e Android reais.
- [ ] Testar o editor e teclado em tela pequena e modo claro, com dados pessoais não reais.
- [ ] Confirmar GitHub Actions habilitado na repo.
- [ ] Aprovar PR de design e integrar seguindo a branch de Spinning; sem merge automático.
