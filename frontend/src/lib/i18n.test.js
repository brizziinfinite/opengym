import { describe, it, expect } from 'vitest'
import { setLang, titleCase } from './i18n.js'

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
    await setLang('en')
  })
})
