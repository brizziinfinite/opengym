import { useId } from 'react'
import { visualForPhase } from '../lib/spinning-visual.js'

// Original, scalable vector artwork. Each posture is instructional, rather
// than an external image: works offline, stays sharp on any phone and needs no
// additional media download. The current phase controls the pose.
export default function SpinningIllustration({ stage, compact = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const visual = visualForPhase(stage)
  const standing = visual.value === 'climb-standing'
  const recovery = visual.value === 'recovery-seated'
  const warmup = visual.value === 'warmup-seated'
  const pose = standing ? {
    head: [160, 43], shoulder: [151, 74], hip: [142, 116], hand: [232, 113],
    torso: 'M151 74 Q143 92 142 116 L117 130 Q125 93 151 74Z',
    arm: 'M156 77 L190 93 L232 113',
    legA: 'M143 115 L166 159 L149 205', legB: 'M140 116 L192 155 L198 204'
  } : recovery ? {
    head: [119, 43], shoulder: [126, 75], hip: [123, 134], hand: [232, 113],
    torso: 'M126 74 Q142 105 126 132 L105 134 Q105 96 126 74Z',
    arm: 'M131 77 L175 98 L232 113',
    legA: 'M121 133 L171 168 L149 205', legB: 'M122 134 L190 164 L198 204'
  } : {
    head: [156, warmup ? 57 : 51], shoulder: [151, warmup ? 88 : 84], hip: [115, 133], hand: [232, 113],
    torso: 'M151 84 Q141 102 115 133 L94 132 Q104 98 151 84Z',
    arm: 'M151 90 L190 104 L232 113',
    legA: 'M115 133 L171 168 L149 205', legB: 'M115 134 L190 164 L198 204'
  }
  const fillSkin = '#EFC49E'
  return <svg className={'spin-illustration' + (compact ? ' compact' : '') + ' ' + className}
    viewBox="0 0 360 240" role="img" aria-label={'Ilustração de postura: ' + visual.label}
    preserveAspectRatio="xMidYMid meet" focusable="false">
    <defs>
      <radialGradient id={id + 'glow'}><stop stopColor="#40f293" stopOpacity=".35"/><stop offset="1" stopColor="#40f293" stopOpacity="0"/></radialGradient>
      <linearGradient id={id + 'frame'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#52f5ac"/><stop offset="1" stopColor="#148d70"/></linearGradient>
      <linearGradient id={id + 'shirt'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#243e54"/><stop offset="1" stopColor="#071724"/></linearGradient>
    </defs>
    <ellipse cx="195" cy="140" rx="155" ry="105" fill={'url(#' + id + 'glow)'} />
    <ellipse cx="174" cy="224" rx="136" ry="8" fill="#020e15" opacity=".52"/>
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Stable flywheel + cycle frame. */}
      <circle cx="253" cy="176" r="41" fill="#081c26" stroke="#235d61" strokeWidth="8"/>
      <circle cx="253" cy="176" r="31" fill="#10323b" stroke="#2ee5a0" strokeWidth="3" opacity=".85"/>
      <circle cx="253" cy="176" r="9" fill="#56eeae"/>
      <path d="M104 222 H280 M142 222 V185 L176 154 L253 176 M176 154 L188 218 M188 218 H207" stroke={'url(#' + id + 'frame)'} strokeWidth="7" fill="none"/>
      <path d="M176 154 L152 124 L122 127 M253 176 L232 117 L257 111" stroke="#44ca94" strokeWidth="7" fill="none"/>
      <path d="M102 126 H139 M226 112 H273 M231 111 L236 99" stroke="#b5e8d8" strokeWidth="7" fill="none"/>
      <path d="M173 169 L190 194 L205 194" stroke="#253f48" strokeWidth="8" fill="none"/>
      <circle cx="173" cy="169" r="10" fill="#122b36" stroke="#6afbc0" strokeWidth="3"/>
      {/* Two pedal links and the corresponding bent legs. */}
      <path d={pose.legB} stroke="#0b1826" strokeWidth="22" fill="none"/>
      <path d={pose.legB} stroke="#31485e" strokeWidth="15" fill="none"/>
      <path d={pose.legA} stroke="#0b1826" strokeWidth="23" fill="none"/>
      <path d={pose.legA} stroke="#1d3248" strokeWidth="16" fill="none"/>
      <path d="M138 208 L161 208 M189 208 L213 208" stroke="#e1f1e8" strokeWidth="9"/>
      {/* Neutral athletic silhouette with posture-specific trunk and arms. */}
      <path d={pose.torso} fill={'url(#' + id + 'shirt)'} stroke="#35675e" strokeWidth="2.5"/>
      <path d={pose.arm} stroke="#132f36" strokeWidth="17" fill="none"/>
      <path d={pose.arm} stroke={fillSkin} strokeWidth="10" fill="none"/>
      <circle cx={pose.hand[0]} cy={pose.hand[1]} r="6" fill={fillSkin}/>
      <path d={'M' + (pose.head[0] - 4) + ' ' + (pose.head[1] + 17) + ' l-2 12'} stroke={fillSkin} strokeWidth="12"/>
      <ellipse cx={pose.head[0]} cy={pose.head[1]} rx="17" ry="19" fill={fillSkin}/>
      <path d={'M' + (pose.head[0] - 18) + ' ' + (pose.head[1] - 4) + ' q3 -22 22 -20 q15 5 13 21 q-11 -8 -26 -3Z'} fill="#142630"/>
      <path d={'M' + (pose.head[0] - 15) + ' ' + (pose.head[1] - 13) + ' q-15 10 -10 27'} stroke="#142630" strokeWidth="6" fill="none"/>
      <path d="M97 133 H122" stroke="#e7f5e6" strokeWidth="4" opacity=".8"/>
    </g>
  </svg>
}
