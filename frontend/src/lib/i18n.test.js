import { describe, it, expect, vi } from 'vitest'
import { setLang, titleCase, t } from './i18n.js'

describe('titleCase', () => {
  it('leaves other languages to CSS', async () => {
    await setLang('en')
    expect(titleCase('leverage machine')).toBe('leverage machine')
  })
  it('keeps Portuguese connectives lower case', async () => {
    await setLang('pt')
    expect(titleCase('máquina articulada')).toBe('Máquina Articulada')
    expect(titleCase('máquina de alavanca')).toBe('Máquina de Alavanca')
    expect(titleCase('dia de descanso')).toBe('Dia de Descanso')
    expect(titleCase('Treino de Pernas')).toBe('Treino de Pernas')
    expect(titleCase('de pé com a barra e o banco na mão')).toBe('De Pé com a Barra e o Banco na Mão')
    expect(titleCase('Membros inferiores A')).toBe('Membros Inferiores A')
    await setLang('en')
  })
})

describe('setLang', () => {
  it('retries after a failed pack import instead of getting stuck on English', async () => {
    let fail = true
    vi.doMock('../locales/pt.js', () => {
      if (fail) throw new Error('chunk 404')
      return import('../locales/pt.js')
    })
    vi.resetModules()
    const fresh = await import('./i18n.js')

    await fresh.setLang('pt')
    expect(fresh.t('Exercises')).toBe('Exercises')   // failed import — stayed on English

    fail = false
    await fresh.setLang('pt')   // same module instance: must not have cached the failure as success
    expect(fresh.t('Exercises')).toBe('Exercícios')

    vi.doUnmock('../locales/pt.js')
  })
})
