import { atom, read, update } from 'claude-code'
import type { PromptOrigin, Register } from 'claude-code'

// Acceso e spento con /oscura: vale per tutta la sessione.
const attivo = atom({ plugin: 'oscura', key: 'attivo' } as const, false)

// Numero del prompt oscurato → testo originale, per rimetterlo a schermo quando si spegne.
const originali = atom({ plugin: 'oscura', key: 'originali' } as const, {} as Record<string, string>)
const contatore = atom({ plugin: 'oscura', key: 'contatore' } as const, 0)

// Quello che compare in chat al posto del prompt. Il numero lega ogni maschera al suo
// originale ovunque finisca la riga (anche un prompt messo in coda mentre Claude lavora).
export const MASCHERA = '▓▓▓▓▓▓▓▓ prompt oscurato ▓▓▓▓▓▓▓▓'
export const maschera = (n?: number) => (n === undefined ? MASCHERA : `▓▓▓▓▓▓▓▓ prompt oscurato #${n} ▓▓▓▓▓▓▓▓`)
const GIA_OSCURATO = /^▓▓▓▓▓▓▓▓ prompt oscurato/
const NUMERATA = /▓▓▓▓▓▓▓▓ prompt oscurato #(\d+) ▓▓▓▓▓▓▓▓/g

// Messaggi che non ha scritto la persona: non si toccano neanche a oscura acceso.
const AUTOMATICI: ReadonlySet<PromptOrigin['kind'] | undefined> = new Set([
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'channel',
  'coordinator',
  'observer',
  'observer-activity',
  'auto-continuation',
  'slack-ping',
])

export const istruzioni = (prompt: string) => `\
[oscura] Qui sotto c'è il messaggio che l'utente ha appena scritto e inviato. \
L'utente usa il plugin "oscura" per nasconderlo dallo schermo: in chat, al suo posto, si vede "${MASCHERA}".
Rispondi a questo messaggio esattamente come se fosse comparso in chat. \
Non ripeterlo, non citarlo, non riassumerlo e non parafrasarlo: né nella risposta, né in titoli, nomi di file o messaggi di commit. \
Chi guarda lo schermo deve vedere il risultato senza poter risalire alla richiesta.

<prompt_oscurato>
${prompt}
</prompt_oscurato>`

// Cosa scrive nella status line: niente quando è spento.
const stato = (acceso: boolean) => (acceso ? '🕶️ oscura' : undefined)

// Un comando o una skill, con o senza argomenti: stesso test che usa Claude Code.
// "/Users/me/app.ts perché crasha?" invece è un prompt normale e va oscurato.
const COMANDO = /^\/[A-Za-z0-9_][A-Za-z0-9:_-]*(?=\s|$)/

// Già oscurati, comandi, messaggi automatici e quelli di altri plugin: da lasciare come sono.
const daLasciare = (text: string, origin?: PromptOrigin) =>
  GIA_OSCURATO.test(text) ||
  COMANDO.test(text) ||
  AUTOMATICI.has(origin?.kind) ||
  (origin?.kind === 'plugin' && !origin.asUser)

const conTesto = <E extends { props: { text: string } }>(e: E, text: string): E => ({ ...e, props: { ...e.props, text } })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'oscura',
      description: 'Accende o spegne l\'oscuramento dei prompt in chat',
      immediate: true,
    })
    $.ui.status(stato(await read($, attivo)))

    return next(e)
  })

  on('command.run', { command: 'oscura' }, async $ => {
    const acceso = await update($, attivo, v => !v)
    $.ui.status(stato(acceso))

    return {
      text: acceso
        ? '🕶️ Oscura acceso: da ora i tuoi prompt in chat diventano ▓▓▓. Rilancia /oscura per spegnerlo.'
        : '👓 Oscura spento: tutti i prompt tornano visibili, anche quelli oscurati prima.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (daLasciare(e.text, e.origin) || !e.text.trim() || !(await read($, attivo))) {
      return next(e)
    }

    const n = await update($, contatore, c => c + 1)
    await update($, originali, righe => ({ ...righe, [n]: e.text }))
    const entrato = await next({ ...e, text: maschera(n), context: [...(e.context ?? []), istruzioni(e.text)] })

    // Scartato da qualcun altro: non c'è nessuna riga da rimettere in chiaro.
    if (entrato.drop !== undefined) {
      await update($, originali, ({ [n]: _scartato, ...resto }) => resto)
    }

    return entrato
  }).catch(($, e, next) =>
    // Meglio non inviare che mostrare il prompt per sbaglio.
    next.called ? next(e) : { drop: 'oscura ha avuto un problema e non ha inviato il prompt, così non è finito in chiaro. Riprova.' },
  )

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { text, origin } = e.props
    const righe = await read($, originali)

    // Acceso: tutto oscurato, anche i messaggi scritti prima di accenderlo.
    // L'app desktop disegna la bolla dal testo digitato: se è un prompt oscurato, prende il suo numero.
    if (await read($, attivo)) {
      if (daLasciare(text, origin)) {
        return next(e)
      }

      const n = Object.keys(righe).find(chiave => righe[chiave] === text)

      return next(conTesto(e, maschera(n === undefined ? undefined : Number(n))))
    }

    // Spento: tutto visibile. Ogni maschera numerata torna al suo testo originale.
    const svelato = text.replace(NUMERATA, (intera: string, n: string) => righe[n] ?? intera)

    return next(svelato === text ? e : conTesto(e, svelato))
  }).catch(($, e, next) =>
    // Anche qui meglio oscurare per sbaglio che mostrare: niente chiamate a $ in questo ramo.
    next.called ? next(e) : next(daLasciare(e.props.text, e.props.origin) ? e : conTesto(e, MASCHERA)),
  )
}
