import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, PromptSubmitInput, RenderElement } from 'claude-code'

import { MASCHERA } from '../hooks/register'

const PERSONA: PromptOrigin = { kind: 'composer' }

// Sta al posto del motore: registra cosa arriva in fondo alla catena di prompt.submit
// e disegna la bolla con il testo che le arriva.
const inFondo = (on: On) => {
  const arrivati: PromptSubmitInput[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    arrivati.push(e)

    return { text: e.text, context: e.context }
  })
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return h(Text, {}, e.props.text) as RenderElement
  })

  return arrivati
}

const avvia = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

const invia = ($: Engine, text: string, origin: PromptOrigin = PERSONA) => $.prompt.submit({ text, wait: false, origin })

const oscura = ($: Engine) =>
  $.command.run({ command: 'oscura', args: '', origin: PERSONA, presentation: { isFullscreen: false, columns: 80 } })

const bolla = async ($: Engine, surface: 'terminal' | 'desktop', text: string) => {
  const ui = await $.ui.mount({
    plugin: 'oscura',
    surface,
    component: 'UserMessage',
    props: { text, origin: PERSONA, isExpanded: false },
  })

  return (await ui.find({ type: 'Text' }))?.text
}

test('spento: i prompt passano intatti', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)
  await invia($, 'ciao')

  expect(arrivati.map(e => e.text)).toEqual(['ciao'])
  expect(arrivati[0]?.context?.some(c => c.includes('<prompt_oscurato>')) ?? false).toBe(false)
})

test('/oscura acceso: in chat ▓▓▓, il testo vero va solo a Claude; spento: torna normale', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)

  expect((await oscura($)).text).toContain('acceso')
  await invia($, 'scrivi un haiku sul caffè')

  expect(arrivati[0]?.text).toBe(MASCHERA)
  expect(arrivati[0]?.context?.at(-1)).toContain('<prompt_oscurato>\nscrivi un haiku sul caffè\n</prompt_oscurato>')

  expect((await oscura($)).text).toContain('spento')
  await invia($, 'ciao')

  expect(arrivati.map(e => e.text)).toEqual([MASCHERA, 'ciao'])
})

test('acceso: i comandi restano visibili, un prompt che inizia con un percorso no', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)
  await oscura($)
  await invia($, '/help')
  await invia($, '/model opus')
  await invia($, '/Users/me/app.ts perché crasha?')

  expect(arrivati.map(e => e.text)).toEqual(['/help', '/model opus', MASCHERA])
  expect(await bolla($, 'desktop', '/model opus')).toBe('/model opus')
  expect(await bolla($, 'desktop', '/Users/me/app.ts perché crasha?')).toBe(MASCHERA)
})

test('acceso: i messaggi di altri plugin e quelli automatici non vengono toccati', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)
  await oscura($)
  await invia($, 'messaggio di un altro plugin', { kind: 'plugin', name: 'altro' })
  await invia($, 'task finito', { kind: 'task-notification' })
  await invia($, 'scritto per conto della persona', { kind: 'plugin', name: 'altro', asUser: true })

  expect(arrivati.map(e => e.text)).toEqual(['messaggio di un altro plugin', 'task finito', MASCHERA])
})

test('la bolla in chat mostra ▓▓▓ su terminale e app desktop', async ($, on) => {
  inFondo(on)
  await avvia($)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await bolla($, surface, 'un segreto')).toBe('un segreto')
  }

  await oscura($)
  await invia($, 'un segreto')

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await bolla($, surface, 'un segreto')).toBe(MASCHERA)
    expect(await bolla($, surface, '/oscura')).toBe('/oscura')
  }

  // Spento, quello già oscurato resta oscurato.
  await oscura($)
  expect(await bolla($, 'desktop', 'un segreto')).toBe(MASCHERA)
  expect(await bolla($, 'desktop', 'un messaggio nuovo')).toBe('un messaggio nuovo')
})
