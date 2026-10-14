import { atom, read, update } from 'claude-code'
import type { PromptOrigin, Register } from 'claude-code'

// Acceso e spento con /oscura: vale per tutta la sessione.
const attivo = atom({ plugin: 'oscura', key: 'attivo' } as const, false)

// I testi originali già oscurati: l'app desktop disegna la bolla dal testo digitato,
// non da quello riscritto, quindi la bolla va oscurata anche al momento del disegno.
const nascosti = atom({ plugin: 'oscura', key: 'nascosti' } as const, [] as string[])

// Quello che compare in chat al posto del prompt.
export const MASCHERA = '▓▓▓▓▓▓▓▓ prompt oscurato ▓▓▓▓▓▓▓▓'

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

// I comandi, i messaggi automatici e quelli di altri plugin restano visibili.
const daLasciare = (text: string, origin?: PromptOrigin) =>
  text === MASCHERA ||
  COMANDO.test(text) ||
  AUTOMATICI.has(origin?.kind) ||
  (origin?.kind === 'plugin' && !origin.asUser)

const oscurata = <E extends { props: { text: string } }>(e: E): E => ({ ...e, props: { ...e.props, text: MASCHERA } })

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
        : '👓 Oscura spento: i prompt tornano visibili.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (daLasciare(e.text, e.origin) || !e.text.trim() || !(await read($, attivo))) {
      return next(e)
    }

    await update($, nascosti, lista => (lista.includes(e.text) ? lista : [...lista, e.text]))

    return next({ ...e, text: MASCHERA, context: [...(e.context ?? []), istruzioni(e.text)] })
  }).catch(($, e, next) =>
    // Meglio non inviare che mostrare il prompt per sbaglio.
    next.called ? next(e) : { drop: 'oscura ha avuto un problema e non ha inviato il prompt, così non è finito in chiaro. Riprova.' },
  )

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { text, origin } = e.props

    if (daLasciare(text, origin)) {
      return next(e)
    }

    const daNascondere = (await read($, attivo)) || (await read($, nascosti)).includes(text)

    return next(daNascondere ? oscurata(e) : e)
  }).catch(($, e, next) =>
    // Anche qui meglio oscurare per sbaglio che mostrare: niente chiamate a $ in questo ramo.
    next.called ? next(e) : next(daLasciare(e.props.text, e.props.origin) ? e : oscurata(e)),
  )
}
