// Spinning Studio: music metadata is descriptive only. No Spotify audio is embedded.
const phase = (name, minutes, rpm, rpe, cue) => ({ name, seconds: minutes * 60, rpm, rpe, cue })
export const SPINNING_CLASSES = [
  {
    id: 'time-machine', title: 'Time Machine', subtitle: 'Anos 80, 90 e hits atuais',
    phases: [
      phase('Aquecimento', 10, '65–80', 3, 'Comece leve, sentado. Aumente a cadência gradualmente.'),
      phase('Primeiras subidas', 14, '65–80', 5, 'Aumente um pouco a carga sem perder o controle.'),
      phase('Terreno ondulado', 13, '65–85', 6, 'Alterne resistência moderada com trechos mais soltos.'),
      phase('Reta final', 9, '70–85', 7, 'Intervalos controlados e recuperações entre esforços.'),
      phase('Recuperação', 7, '60–75', 2, 'Reduza a carga e deixe a respiração recuperar.')
    ],
    tracks: [
      ['Sweet Dreams', 'Eurythmics'], ['Training Season', 'Dua Lipa'],
      ['Rhythm Is a Dancer', 'SNAP!'], ['Houdini', 'Dua Lipa'],
      ['You Spin Me Round', 'Dead or Alive'], ['What Is Love', 'Haddaway'],
      ['Physical', 'Dua Lipa'], ['Pump Up the Jam', 'Technotronic'],
      ['Abracadabra', 'Lady Gaga'], ['Freed From Desire', 'Gala'],
      ['Miracle', 'Calvin Harris & Ellie Goulding'], ['Better Off Alone', 'Alice Deejay'],
      ['APT.', 'ROSÉ & Bruno Mars'], ['BIRDS OF A FEATHER', 'Billie Eilish'],
      ['Time After Time', 'Cyndi Lauper']
    ]
  },
  {
    id: 'dance-8090', title: 'Dance 80/90', subtitle: 'Eurodance e disco',
    phases: [
      phase('Aquecimento', 12, '65–85', 3, 'Encontre sua cadência com carga leve.'),
      phase('Terreno ondulado', 13, '65–85', 5, 'Subida moderada, seguida de alívio.'),
      phase('Primeiro pico', 12, '65–85', 7, 'Segure uma resistência desafiadora e sustentável.'),
      phase('Segundo pico', 9, '65–85', 7, 'Última subida, com pausa de recuperação.'),
      phase('Recuperação', 7, '60–75', 2, 'Reduza gradualmente o esforço.')
    ],
    tracks: [
      ['Everybody Wants to Rule the World', 'Tears for Fears'],
      ['Never Gonna Give You Up', 'Rick Astley'], ['The Rhythm of the Night', 'Corona'],
      ['Gonna Make You Sweat', 'C+C Music Factory'], ['Vogue', 'Madonna'],
      ['Gypsy Woman', 'Crystal Waters'], ['Show Me Love', 'Robin S'],
      ['Mr. Vain', 'Culture Beat'], ['No Limit', '2 Unlimited'],
      ['Be My Lover', 'La Bouche'], ["Everybody's Free", 'Rozalla'],
      ['Missing (Todd Terry Remix)', 'Everything But The Girl'], ['True Colors', 'Cyndi Lauper']
    ]
  },
  {
    id: 'rock-classics', title: 'Rock Classics', subtitle: 'Guitarras e resistência',
    phases: [
      phase('Aquecimento', 10, '65–85', 3, 'Inicie suave e estabeleça uma pedalada estável.'),
      phase('Primeiras montanhas', 12, '65–80', 6, 'Adicione carga aos poucos para simular uma subida.'),
      phase('Desafio de ritmo', 12, '65–85', 7, 'Alterne esforço e recuperação mantendo a técnica.'),
      phase('Final de show', 11, '65–85', 7, 'Última sequência intensa, sem exigir esforço máximo.'),
      phase('Recuperação', 5, '60–70', 2, 'Pedale leve e recupere a respiração.')
    ],
    tracks: [
      ['Walk of Life', 'Dire Straits'], ["Summer of '69", 'Bryan Adams'],
      ['Eye of the Tiger', 'Survivor'], ['You Give Love a Bad Name', 'Bon Jovi'],
      ['Jump', 'Van Halen'], ['The Final Countdown', 'Europe'],
      ['Are You Gonna Go My Way', 'Lenny Kravitz'], ['Thunderstruck', 'AC/DC'],
      ['Song 2', 'Blur'], ["Don't Stop Me Now", 'Queen'],
      ["Livin' on a Prayer", 'Bon Jovi'], ['You Shook Me All Night Long', 'AC/DC'],
      ['Every Breath You Take', 'The Police']
    ]
  },
  {
    id: 'electronic', title: 'Eletrônico Atual', subtitle: 'House e EDM',
    phases: [
      phase('Aquecimento', 9, '70–85', 3, 'Comece em ritmo leve e progressivo.'),
      phase('Primeiras subidas', 11, '65–80', 6, 'Aumente a resistência e mantenha o controle.'),
      phase('Intervalos', 10, '65–85', 7, 'Esforços curtos com recuperação suficiente.'),
      phase('Último bloco', 11, '65–85', 7, 'Subida final e alívio progressivo.'),
      phase('Desaceleração', 8, '60–80', 2, 'Recupere até voltar a pedalar tranquilamente.')
    ],
    tracks: [
      ['Move', 'Adam Port & Stryv'], ['I Adore You', 'HUGEL, Topic & Arash'],
      ['Beautiful People', 'David Guetta & Sia'], ['Blessings', 'Calvin Harris & Clementine Douglas'],
      ['Dreamin', 'Dom Dolla & Daya'], ['Focus', 'John Summit & CLOVES'],
      ['Shiver', 'John Summit & Hayla'], ['It Feels So Good', 'Matt Sassari, HUGEL & Sonique'],
      ['No Broke Boys', 'Disco Lines & Tinashe'], ['The Days (NOTION Remix)', 'CHRYSTAL & NOTION'],
      ['Where You Are', 'John Summit & Hayla'], ['Mwaki', 'Zerb & Sofiya Nzau'],
      ['Neverender', 'Justice & Tame Impala'], ["Stumblin' In", 'CYRIL']
    ]
  }
]
export const classById = id => SPINNING_CLASSES.find(c => c.id === id) || null
export const durationSeconds = c => c.phases.reduce((sum, p) => sum + p.seconds, 0)
export const sessionElapsed = (active, now = Date.now()) => {
  if (!active) return 0
  const stored = Math.max(0, Number(active.elapsedSec) || 0)
  return stored + (active.running ? Math.max(0, now - (active.runningSince || now)) / 1000 : 0)
}
export function phaseAt(c, seconds) {
  if (!c || !c.phases.length) return null
  const total = durationSeconds(c)
  const elapsed = Math.min(total, Math.max(0, Number(seconds) || 0))
  let start = 0
  for (let i = 0; i < c.phases.length; i++) {
    const end = start + c.phases[i].seconds
    if (elapsed < end || i === c.phases.length - 1) {
      return { index: i, phase: c.phases[i], elapsed, start, end, remaining: Math.max(0, end - elapsed), total }
    }
    start = end
  }
}
export function clock(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0))
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0')
}
