import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, PromptSubmitInput, RenderElement } from 'claude-code'

import { MASCHERA, maschera } from '../hooks/register'

const PERSONA: PromptOrigin = { kind: 'composer' }

// Sta al posto del motore: registra cosa arriva in fondo alla catena di prompt.submit
// (scartando i testi in `scarta`) e disegna la bolla con il testo che le arriva.
const inFondo = (on: On, scarta: string[] = []) => {
  const arrivati: PromptSubmitInput[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    if (e.context?.some(c => scarta.some(testo => c.includes(`<prompt_oscurato>\n${testo}\n`)))) {
      return { drop: 'scartato dal test' }
    }
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

const monta = ($: Engine, surface: 'terminal' | 'desktop', text: string) =>
  $.ui.mount({ plugin: 'oscura', surface, component: 'UserMessage', props: { text, origin: PERSONA, isExpanded: false } })

const bolla = async ($: Engine, surface: 'terminal' | 'desktop', text: string) => {
  const ui = await monta($, surface, text)
  const testo = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()

  return testo
}

test('spento: i prompt passano intatti', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)
  await invia($, 'ciao')

  expect(arrivati.map(e => e.text)).toEqual(['ciao'])
  expect(arrivati[0]?.context?.some(c => c.includes('<prompt_oscurato>')) ?? false).toBe(false)
})

test('acceso: in chat ▓▓▓ numerato, il testo vero va solo a Claude; spento: torna normale', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)

  expect((await oscura($)).text).toContain('acceso')
  await invia($, 'scrivi un haiku sul caffè')
  await invia($, 'e uno sul tè')

  expect(arrivati.map(e => e.text)).toEqual([maschera(1), maschera(2)])
  expect(arrivati[0]?.context?.at(-1)).toContain('<prompt_oscurato>\nscrivi un haiku sul caffè\n</prompt_oscurato>')

  expect((await oscura($)).text).toContain('spento')
  await invia($, 'ciao')

  expect(arrivati.at(-1)?.text).toBe('ciao')
})

test('acceso: i comandi restano visibili, un prompt che inizia con un percorso no', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)
  await oscura($)
  await invia($, '/help')
  await invia($, '/model opus')
  await invia($, '/Users/me/app.ts perché crasha?')

  expect(arrivati.map(e => e.text)).toEqual(['/help', '/model opus', maschera(1)])
  expect(await bolla($, 'desktop', '/model opus')).toBe('/model opus')
  expect(await bolla($, 'desktop', '/Users/me/app.ts perché crasha?')).toBe(maschera(1))
})

test('acceso: i messaggi di altri plugin, quelli automatici e quelli già oscurati non vengono toccati', async ($, on) => {
  const arrivati = inFondo(on)
  await avvia($)
  await oscura($)
  await invia($, 'messaggio di un altro plugin', { kind: 'plugin', name: 'altro' })
  await invia($, 'task finito', { kind: 'task-notification' })
  await invia($, maschera(7))
  await invia($, 'scritto per conto della persona', { kind: 'plugin', name: 'altro', asUser: true })

  expect(arrivati.map(e => e.text)).toEqual(['messaggio di un altro plugin', 'task finito', maschera(7), maschera(1)])
})

test('acceso: le bolle mostrano ▓▓▓, anche quelle scritte prima di accenderlo', async ($, on) => {
  inFondo(on)
  await avvia($)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await bolla($, surface, 'scritto prima')).toBe('scritto prima')
  }

  await oscura($)
  await invia($, 'un segreto')

  for (const surface of ['terminal', 'desktop'] as const) {
    // Desktop: bolla dal testo digitato. Terminale: bolla dalla riga salvata.
    expect(await bolla($, surface, 'un segreto')).toBe(maschera(1))
    expect(await bolla($, surface, maschera(1))).toBe(maschera(1))
    expect(await bolla($, surface, 'scritto prima')).toBe(MASCHERA)
    expect(await bolla($, surface, '/oscura')).toBe('/oscura')
  }
})

test('spento: ogni prompt oscurato torna al suo testo, anche se messo in coda mentre Claude lavorava', async ($, on) => {
  inFondo(on)
  await avvia($)
  await oscura($)
  await invia($, 'segreto A')
  await invia($, 'segreto B')
  await oscura($)

  // Desktop: la bolla ha il testo digitato.
  expect(await bolla($, 'desktop', 'segreto A')).toBe('segreto A')
  // Terminale: la riga salvata è la maschera numerata.
  expect(await bolla($, 'terminal', maschera(2))).toBe('segreto B')
  expect(await bolla($, 'terminal', maschera(1))).toBe('segreto A')
  // Prompt messo in coda: la riga lo avvolge in altro testo, a volte insieme ad altri.
  expect(await bolla($, 'terminal', `In coda: ${maschera(1)}\n${maschera(2)}`)).toBe('In coda: segreto A\nsegreto B')
  // Una maschera che oscura non conosce resta com'è.
  expect(await bolla($, 'terminal', maschera(99))).toBe(maschera(99))
})

test('un prompt scartato non sposta gli altri', async ($, on) => {
  const arrivati = inFondo(on, ['scartami'])
  await avvia($)
  await oscura($)
  await invia($, 'segreto A')
  await invia($, 'scartami')
  await invia($, 'segreto C')
  await oscura($)

  expect(arrivati.map(e => e.text)).toEqual([maschera(1), maschera(3)])
  expect(await bolla($, 'terminal', maschera(1))).toBe('segreto A')
  expect(await bolla($, 'terminal', maschera(2))).toBe(maschera(2))
  expect(await bolla($, 'terminal', maschera(3))).toBe('segreto C')
})

test('la bolla si ridisegna da sola quando si accende e si spegne', async ($, on) => {
  inFondo(on)
  await avvia($)
  await oscura($)
  await invia($, 'un segreto')

  const ui = await monta($, 'terminal', maschera(1))
  expect((await ui.find({ type: 'Text' }))?.text).toBe(maschera(1))

  await oscura($)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('un segreto')

  await oscura($)
  expect((await ui.find({ type: 'Text' }))?.text).toBe(maschera(1))
  await ui.unmount()
})
