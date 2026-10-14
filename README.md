# 🕶️ oscura

**Mostra l'output, nascondi il prompt.**

Un mod per [Claude Code](https://claude.com/claude-code). Accendi `/oscura` e quello che scrivi in chat diventa `▓▓▓`: chi guarda lo schermo vede solo le risposte di Claude, mai le tue richieste. Claude invece legge il testo vero e risponde normalmente.

<p align="center">
  <img src="assets/demo.svg" alt="A sinistra la chat: il messaggio appare come ▓▓▓ prompt oscurato ▓▓▓ e sotto c'è la risposta di Claude. A destra quello che legge Claude: il prompt vero in un contesto nascosto." width="100%">
</p>

Utile per demo, screen recording, live e screenshot da postare, quando vuoi far vedere il risultato e tenerti il trucco.

## Installazione

Serve Claude Code aggiornato (testato sulla 2.1.293). In un terminale:

```bash
claude update
```

```bash
claude plugin marketplace add lucatozziGZ/oscura
```

```bash
claude plugin install oscura@oscura
```

Fatto. Il mod è attivo in Claude Code, sia nel terminale sia nella tab Code dell'app desktop, in tutte le sessioni avviate **dopo** l'installazione. Una sessione che era già aperta mentre installavi non lo vede: aprine una nuova.

## Come si usa

Funziona in qualsiasi chat, anche in una già avviata da tempo:

1. Scrivi **`/oscura`**. Compare `🕶️ Oscura acceso` e, nel terminale, `🕶️ oscura` nella status line.
2. Scrivi i tuoi prompt normalmente: in chat diventano `▓▓▓▓▓▓▓▓ prompt oscurato ▓▓▓▓▓▓▓▓`.
3. Riscrivi **`/oscura`** per spegnerlo. I messaggi già oscurati restano oscurati, e anche un messaggio nuovo identico a uno già oscurato.

**In una chat nuova, nell'app desktop:** prima di tutto manda un messaggio qualsiasi, per esempio `ciao`, perché il primo messaggio a Claude non si può oscurare (vedi [perché](#cosa-nasconde-e-cosa-no)). Poi `/oscura` e via. Nelle chat già avviate questo passaggio non serve.

I comandi e le skill (`/qualcosa`) restano sempre visibili, **argomenti compresi**: non scriverci dentro niente da nascondere. Un prompt che inizia con un percorso, tipo `/Users/me/app.ts perché crasha?`, invece viene oscurato. `/oscura` vale per la chat in cui lo accendi: ogni chat nuova parte spenta.

## Come funziona

Circa 100 righe in [`hooks/register.ts`](hooks/register.ts), quattro agganci:

| Aggancio | Cosa fa |
|---|---|
| `session.start` | registra il comando `/oscura` e imposta la status line |
| `command.run` | `/oscura` accende e spegne |
| `prompt.submit` | quando invii, sostituisce il testo con `▓▓▓` e passa il prompt vero a Claude come *context* nascosto, con l'istruzione di non ripeterlo, citarlo o parafrasarlo mai |
| `ui.render` su `UserMessage` | l'app desktop disegna la bolla dal testo digitato, non da quello riscritto: questo oscura anche la bolla |

Se il mod va in errore, sbaglia dalla parte sicura: il prompt non viene inviato e la bolla viene oscurata. Meglio niente che in chiaro.

## Cosa nasconde e cosa no

È un trucco da palcoscenico, non uno strumento di sicurezza.

| | |
|---|---|
| ✅ Bolle dei tuoi messaggi | Si vede solo `▓▓▓` |
| ✅ Titolo della chat | Non contiene i prompt oscurati |
| ⚠️ Primo messaggio a Claude in una chat nuova (app desktop) | L'app disegna quella bolla da sola, prima che il mod possa intervenire. Per questo il primo messaggio va "sprecato" con un `ciao` |
| ⚠️ Mentre scrivi | La casella di testo mostra quello che digiti. In diretta, scrivi il prompt fuori inquadratura |
| ⚠️ Ragionamento visibile | Se apri il "thinking" di Claude, lì il prompt può comparire. Tienilo chiuso mentre registri |
| ⚠️ Log locali | Il prompt resta nei file di sessione in `~/.claude/projects/` |
| ❌ Output rivelatore | Se la risposta ripete la richiesta per natura (es. "traduci questa frase"), da lì si capisce |

## Disinstallare

```bash
claude plugin uninstall oscura@oscura
```

## Sviluppo

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

## English

**Show the output, hide the prompt.** A Claude Code mod: type `/oscura` and your messages show up in the chat as `▓▓▓ prompt oscurato ▓▓▓`, while Claude receives the real prompt as hidden context and is told never to repeat it. Install with `claude plugin marketplace add lucatozziGZ/oscura` and `claude plugin install oscura@oscura`, then start a new session. It works in any chat, including ones already in progress. Only in a brand-new chat in the desktop app can the first message not be hidden, so send a throwaway one first. It's a stage trick for demos and screen recordings, not a security tool: the prompt is visible while you type it and stays in your local session logs.

## Licenza

[MIT](LICENSE)
