import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

// A lazy chunk (locale pack, instructions, names…) 404s when index.html is stale from a
// deploy that already rotated the asset hashes. Vite's documented fix: reload once to
// pick up the fresh index.html instead of leaving the app stuck on a failed import.
window.addEventListener('vite:preloadError', () => location.reload())
