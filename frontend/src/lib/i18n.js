// Tiny dependency-free i18n. English source strings are the keys; locale files in
// src/locales/ map them to translations and are lazy-loaded (Vite code-splits each
// import.meta.glob entry), so the initial bundle stays English-only.
// Exercise instructions come from separately generated packs in src/instr/ (one per
// language, from the upstream dataset) — also lazy-loaded on language switch.
import { useSyncExternalStore } from 'react'

// UI languages. de has no instruction pack upstream — instructions fall back to English.
// pt is not upstream either; its pack is translated locally (scripts/translate-instructions-pt.mjs).
export const LANGS = {
  en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano',
  pt: 'Português (Brasil)', pl: 'Polski', tr: 'Türkçe', ru: 'Русский', zh: '中文',
  ko: '한국어', hi: 'हिन्दी'
}
export const INSTR_LANGS = ['en', 'es', 'fr', 'it', 'pt', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko']
const DATE_LOCALES = {
  en: 'en-GB', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR',
  pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ko: 'ko-KR', hi: 'hi-IN'
}

// First UI language the browser prefers that we ship (pt-BR → pt, de-AT → de …), else English.
// Used as the default for profiles that never picked one.
export function browserLang() {
  try {
    const prefs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || []
    for (const p of prefs) {
      const base = String(p || '').toLowerCase().split('-')[0]
      if (LANGS[base]) return base
    }
  } catch { /* */ }
  return 'en'
}

const localePacks = import.meta.glob('../locales/*.js')
const instrPacks = import.meta.glob('../instr/*.js')
// Exercise names are English in the dataset; a language with a pack in src/names/ shows its own.
const namePacks = import.meta.glob('../names/*.js')

let lang = 'en'
let loadedLang = null        // last language whose packs actually resolved — null on first load or after a failed import
let dict = {}
let instr = null            // { exId: [steps] } for the current language, null = English
let names = null            // { exId: name } for the current language, null = English
let version = 0
const subs = new Set()
const notify = () => { version++; subs.forEach(f => f()) }

export const getLang = () => lang
export const dateLocale = () => DATE_LOCALES[lang] || 'en-GB'

// Translate a source string; {0},{1}… are replaced with args (also on the English fallback).
export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}
// Instructions for an exercise in the current language (English steps as fallback).
export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []
// Display name of an exercise in the current language. Custom exercises keep what the user typed.
export const nameOf = ex => (ex && names && !ex.custom && names[ex.id]) || (ex && ex.n) || ''
// Title case for short labels (chips, tags, day/routine titles). CSS text-transform capitalizes every
// word, which reads wrong in Portuguese ("Máquina De Alavanca"), so pt labels are cased here — first
// letter of each word up, connectives lower — and the CSS rule is switched off for pt.
const PT_LOWER = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'na', 'no', 'em', 'a', 'o'])
export function titleCase(s) {
  if (lang !== 'pt' || typeof s !== 'string') return s
  return s.split(' ').map((w, i) => i > 0 && PT_LOWER.has(w.toLowerCase())
    ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
// True while exercise names come from a names pack — those are already cased for display.
export const namesLocalized = () => !!names

export async function setLang(l) {
  if (!LANGS[l]) l = 'en'
  if (l === lang && loadedLang === l) return
  lang = l
  let ok = true
  try {
    dict = l === 'en' ? {} : (await localePacks['../locales/' + l + '.js']()).default
    instr = l === 'en' || !INSTR_LANGS.includes(l) ? null : (await instrPacks['../instr/' + l + '.js']()).default
  } catch (e) { dict = {}; instr = null; ok = false }
  try {
    const np = namePacks['../names/' + l + '.js']
    names = np ? (await np()).default : null
  } catch (e) { names = null; ok = false }
  loadedLang = ok ? l : null   // a failed import must be retryable, not cached as done
  notify()
}

// Re-renders the subscribing component (and its children) whenever the language changes.
export function useLang() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, () => version)
}
