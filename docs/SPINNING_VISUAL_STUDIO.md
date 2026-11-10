# Spinning Studio 2.0 — roteiro visual

## Experiência

- Durante uma aula, o cronômetro do Gyn define a etapa atual e atualiza a ilustração, a postura, a cadência sugerida, o esforço percebido e o tempo restante.
- A próxima etapa aparece com uma prévia ilustrada.
- **Ver roteiro → Por etapa** mostra todas as etapas e suas imagens.
- **Ver roteiro → Música a música** apresenta as músicas **sugeridas** pelo programa com posturas e janelas de tempo **aproximadas**, divididas igualmente para referência visual. **Não corresponde à playlist real** e não identifica a faixa que está tocando.
- **Conectar playlist / Abrir no Spotify** continua abrindo o serviço externo. O Gyn não reproduz, controla ou sincroniza áudio, nem lê a ordem ou a duração das músicas da conta Spotify.
- No editor de uma aula, o professor pode escolher a imagem/postura de cada etapa em **Imagem e postura da etapa**. Um visual ausente é inferido com prudência a partir do nome da etapa, para preservar aulas antigas.

## Implementação

- `frontend/src/lib/spinning-visual.js`: catálogo de seis posturas, fallback para aulas antigas, roteiros por etapa e música estimada.
- `frontend/src/components/SpinningIllustration.jsx`: ilustração vetorial local. Sem ativos externos, download de imagens ou licenças adicionais.
- `frontend/src/views/Spinning.jsx`: painel principal, orientação, próxima etapa e roteiro.
- `frontend/src/views/SpinningBuilder.jsx`: personalização da postura por etapa.
- Estado existente dos usuários, duração das etapas, histórico de aulas e links Spotify são preservados. Nenhuma migração de dados é exigida.

## Checklist de homologação

1. Conferir em celular de 320–430px a ausência de scroll horizontal e a leitura das métricas.
2. Iniciar uma aula existente, verificar a primeira postura e prévia da próxima.
3. Abrir o roteiro por etapa e por música; ler o aviso de estimativa sem sincronia Spotify.
4. Pausar, continuar e recarregar, sem perder o tempo acumulado.
5. Personalizar uma aula, selecionar uma postura, aprovar e confirmar a imagem escolhida.
6. Conferir o botão externo do Spotify e um perfil com treinos já existentes.

## Segurança

As instruções são orientações visuais genéricas. Não substituir orientação individual de professor habilitado ou avaliação de saúde; adaptar esforço e postura conforme conforto, experiência e limitações.
