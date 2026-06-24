# Dashboard

Crea una **home page / pagina di panoramica** personale da una griglia responsiva di widget. Una dashboard è un file `.dashboard` che dispone **viste Bases**, **note**, **pagine web** e **output di workflow** in una griglia in cui si trascina e si ridimensiona. Aprila come qualsiasi nota per ottenere una board modificabile in tempo reale.

![Dashboard](images/dashboard.png)

---

## Dashboard vs Canvas

Il **Canvas** di Obsidian e una Dashboard sembrano simili ma risolvono problemi diversi:

| | Dashboard | Canvas |
|---|-----------|--------|
| **Contenuto** | **In tempo reale** — Le viste Bases, l'output dei workflow e le note si aggiornano da sole (basate su query) | **Statico** — le schede sono istantanee posizionate a mano |
| **Layout** | Griglia responsiva (12 colonne; si riorganizza in una singola colonna su schermi stretti) | Piano infinito libero con posizioni assolute |
| **Scopo** | Una **home page / pagina di panoramica** strutturata che apri per controllare lo stato | Uno spazio per **pensare** — organizzare idee e collegarle con frecce |
| **IA** | Creata dalla chat (la skill `dashboard` costruisce il file e i suoi dati `.base` sottostanti) | Posizionamento manuale |
| **Visualizzazione** | Una modalità di visualizzazione in sola lettura che non può essere alterata | Sempre modificabile |

In breve: usa una **Dashboard** per una panoramica in tempo reale a colpo d'occhio (attività, riepiloghi generati, pagine incorporate); usa un **Canvas** per pensare in modo libero e spaziale e per le relazioni. I compromessi chiave sono **dinamico vs statico** e **griglia responsiva vs posizionamento libero**.

---

## Creare una dashboard

Ci sono due modi per creare una dashboard:

1. **Comando** — esegui **«Gemini Helper: Crea dashboard»** dalla palette dei comandi. Questo crea un nuovo file nella cartella `Dashboards/` (denominato `Dashboard`, `Dashboard 2`, …) e lo apre.
2. **Chiedere all'IA** — il plugin include una skill di agente integrata **`dashboard`**. Attivala nella chat e descrivi ciò che vuoi (*«una home page con le mie attività attive, una nota di benvenuto e il meteo di oggi»*). L'IA crea il file `.dashboard` — e qualsiasi file `.base` sottostante — per te.

Le dashboard vengono memorizzate come semplici file `.dashboard` nel tuo vault, quindi si sincronizzano e si versionano come qualsiasi altra nota.

---

## Modalità di modifica

Ogni dashboard si apre in **modalità di visualizzazione**. Usa la barra degli strumenti per cambiare:

- **Modifica** — entra in modalità di modifica: trascina i widget per spostarli, trascina l'angolo in basso a destra di un widget per ridimensionarlo, fai clic sull'**ingranaggio** per configurare un widget e sul **cestino** per eliminarlo.
- **+ Aggiungi widget** — apre la palette dei widget (solo in modalità di modifica).
- **Annulla / Ripeti** — scorri le modifiche al layout effettuate in questa sessione.
- **Fatto** — torna alla modalità di visualizzazione.

> Tutte le modifiche vengono **salvate automaticamente** — non c'è un pulsante di salvataggio separato.

---

## Tipi di widget

Fai clic su **+ Aggiungi widget** nella modalità di modifica per scegliere un tipo di widget:

![Palette aggiungi widget](images/dashboard_widgets.png)

### Base — incorporare una vista Bases

Renderizza una vista con nome di un file `.base` tramite l'**interfaccia Bases nativa** di Obsidian (tabella / schede / elenco / mappa). Questo è il widget dati principale — usalo per qualsiasi elenco, tabella o vista a schede di note invece di reimplementarli.

![Impostazioni del widget Base](images/dashboard_base.png)

| Impostazione | Descrizione |
|---------|-------------|
| **File base** | Percorso vault al file `.base` |
| **Vista** | Il nome della vista da renderizzare; lascia vuoto per usare la prima vista della base |
| **Crea con l'IA** | Creare un nuovo file `.base` (o modificare quello selezionato) senza lasciare il pannello |

Lo stesso file `.base` può essere referenziato da più widget Base — ad esempio, un widget per vista (Active / Done / Backlog).

### Markdown — incorporare una nota

Renderizza una nota Markdown esistente inline come incorporamento di sola lettura (con un link per aprire la nota completa).

![Impostazioni del widget Markdown](images/dashboard_markdown.png)

| Impostazione | Descrizione |
|---------|-------------|
| **Nota markdown** | Percorso vault alla nota da incorporare (selettore con ricerca) |

### Web Embed — incorporare una pagina web

Incorpora una pagina web in un iframe.

![Impostazioni del widget Web Embed](images/dashboard_web.png)

| Impostazione | Descrizione |
|---------|-------------|
| **URL** | La pagina da incorporare |

> [!NOTE]
> Alcuni siti inviano header `X-Frame-Options` / `Content-Security-Policy` che bloccano l'incorporamento e appariranno vuoti.

### Workflow — renderizzare l'output di un workflow

Esegue un [workflow](WORKFLOW_NODES_it.md) esistente in modalità **headless** e renderizza il suo output come Markdown o HTML. Questo ti permette di mettere contenuti dinamici e generati (riepiloghi, report) su una dashboard.

![Impostazioni del widget Workflow](images/dashboard_workflow.png)

| Impostazione | Descrizione |
|---------|-------------|
| **Formato di output** | `Markdown` o `HTML` (l'HTML viene renderizzato in un iframe in sandbox) |
| **Workflow** | La nota di workflow da eseguire |
| **Crea con l'IA** | Creare un nuovo workflow (o modificare quello selezionato) per questo widget |
| **Variabile di output** | La variabile del workflow che contiene la stringa di output (predefinito `result`) |
| **Esegui** | Eseguire il workflow ora e memorizzare il risultato nella cache |
| **Intervallo di aggiornamento automatico (minuti)** | `0` = solo manuale; altrimenti viene eseguito una volta all'apertura se il risultato in cache è più vecchio di questo |

> [!IMPORTANT]
> **I widget di workflow renderizzano da una cache, non in tempo reale.** Per evitare di rieseguire workflow pesanti ogni volta che si apre la board, il percorso di rendering legge **solo** da un risultato in cache. Un'esecuzione avviene solo quando:
> - fai clic su **Esegui** (nell'intestazione del widget o nel pannello delle impostazioni), oppure
> - apri la dashboard e il risultato in cache è più vecchio dell'intervallo di aggiornamento automatico.
>
> I risultati vengono memorizzati in un file **sidecar** nascosto accanto alla dashboard, in modo che l'output sopravviva alla riapertura senza gonfiare il file `.dashboard`. Il workflow deve memorizzare il suo output Markdown/HTML in una variabile stringa (predefinito `result`) — gli output a schede/tabelle non sono supportati. Poiché viene eseguito senza supervisione, il workflow non deve usare nodi interattivi (`prompt-*`, `dialog`).

### Kanban — trascina le schede per cambiare lo stato

Rende le note che corrispondono a un filtro per **tag** e/o **cartella** come schede raggruppate in colonne in base a una **proprietà di stato** del frontmatter. Trascina una scheda in un'altra colonna per aggiornare lo stato di quella nota (scritto tramite `processFrontMatter`). Clicca su una scheda per visualizzarne l'anteprima della nota in una finestra di dialogo; l'icona di apertura della finestra apre la nota in una nuova scheda. La board è interattiva in **modalità di visualizzazione** — non è necessario entrare in modalità di modifica per trascinare le schede.

![Board Kanban](images/dashboard_kanban.png)

L'intestazione della board mostra un **titolo** opzionale (utile quando una dashboard contiene più board) e un pulsante **Nuova**. Nuova apre una piccola finestra di dialogo per inserire il titolo della scheda e scegliere la sua colonna, quindi crea una nota che corrisponde già ai filtri di questa board — collocata nella cartella configurata, con il tag configurato e impostata sullo stato della colonna scelta. La nuova scheda appare sulla board (rimani sulla dashboard); cliccala quando vuoi aprire la nota.

Configura la board dalle impostazioni del widget in modalità di modifica:

![Impostazioni Kanban](images/dashboard_kanban_edit.png)

| Impostazione | Descrizione |
|---------|-------------|
| **Titolo della board** | Mostrato nell'intestazione della board. Utile quando più board condividono una dashboard. |
| **Filtro per tag** | Mostra solo le note con questo tag (senza `#`). Vuoto = tutti i tag. |
| **Filtro per cartella** | Mostra solo le note il cui percorso inizia con questo prefisso. Vuoto = intero vault. |
| **Proprietà di stato** | Proprietà del frontmatter che contiene lo stato della scheda (predefinito `status`). |
| **Proprietà del titolo** | Proprietà del frontmatter mostrata come titolo della scheda. Vuoto = nome del file. |
| **Colonne** | Elenco ordinato di valori di stato. Ogni colonna ha un **valore** (confrontato con la proprietà) e un'**etichetta** (mostrata come intestazione). |
| **Mostra colonna delle schede non corrispondenti** | Se attivato, le schede il cui stato non corrisponde a nessuna colonna appaiono in una colonna aggiuntiva «Non specificato» (predefinito attivato). |

I tipi di widget sconosciuti (ad esempio, da una versione più recente del plugin) vengono **conservati al salvataggio** e renderizzati come un segnaposto, in modo che la modifica di una dashboard sconosciuta non perda mai dati.

---

## Layout responsivo

La griglia ha due breakpoint, commutati in base alla larghezza del contenitore:

| Breakpoint | Quando | Layout |
|------------|------|--------|
| **`lg`** (largo) | ≥ 768px | Il layout che disponi nella modalità di modifica (predefinito 12 colonne) |
| **`sm`** (stretto) | < 768px | I widget si riorganizzano in una **singola colonna a larghezza piena**, impilati dall'alto verso il basso |

Per impostazione predefinita, il layout `sm` viene **derivato automaticamente** dal layout largo (ordinato per posizione verticale). Se sposti i widget mentre sei su uno schermo stretto, quelle posizioni `sm` esplicite vengono mantenute e i widget rimanenti riempiono gli spazi attorno a esse.

---

## Creare widget con l'IA

Sia il widget **Base** che il widget **Workflow** hanno un pulsante **Crea con l'IA** nel loro pannello delle impostazioni:

- Per un widget **Base**, apre la finestra di creazione con IA per un file `.base`. Se una base è già selezionata, il pulsante diventa **Modifica con l'IA** e la modifica.
- Per un widget **Workflow**, genera (o modifica) un workflow su misura per il widget — all'IA viene detto di produrre una singola stringa Markdown/HTML nella variabile di output e di evitare i nodi interattivi, in modo che il risultato venga renderizzato in headless. Dopo la generazione, il widget viene **eseguito e aggiornato automaticamente**.

Puoi anche creare un'intera dashboard dalla chat usando la skill di agente integrata **`dashboard`**, che conosce lo schema `.dashboard` e il riferimento per la creazione di Bases.

---

## Il formato di file `.dashboard`

Un file `.dashboard` è YAML. Normalmente non lo modifichi mai a mano (l'editor visuale e l'IA lo gestiscono), ma lo schema è documentato qui come riferimento e per la sicurezza del round-trip.

```yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>                            # unique id (UUID-like string)
    type: base | markdown | web | workflow | kanban
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }      # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }     # optional: auto-derived (stacked) if omitted
    config: { ... }                       # per-widget-type config (see below)
```

- **`layout.lg`** è la posizione sulla griglia larga (≥768px). `x`/`y` sono la cella in alto a sinistra basata su 0; `w`/`h` sono larghezza/altezza in celle della griglia.
- **`layout.sm`** è la posizione su schermi stretti. Omettila per impilare automaticamente a larghezza piena della griglia.
- Posiziona i widget in modo che non si sovrappongano; impilali verticalmente aumentando `y`.

### `config` per widget

```yaml
# base
config:
  base: Dashboards/Bases/Tasks.base   # vault path to the .base file
  view: Active                     # view name; omit/empty = first view

# markdown
config:
  path: Home.md                    # vault path to a markdown note

# web
config:
  url: https://example.com

# workflow
config:
  workflow: workflows/Daily Digest.md  # vault path to the workflow note
  output: markdown                     # markdown | html
  outputVariable: result               # variable holding the output string
  refreshInterval: 60                  # minutes; 0/omit = manual refresh only

# kanban
config:
  tag: task                            # optional tag filter (without #)
  folder: ""                           # optional folder path prefix
  statusProperty: status               # frontmatter property holding the status
  titleProperty: ""                    # frontmatter property for card title (empty = file name)
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
```

### Esempio completo

```yaml
version: 1
grid:
  cols: 12
  rowHeight: 80
  gap: 8
widgets:
  - id: tasks-active
    type: base
    layout: { lg: { x: 0, y: 0, w: 8, h: 6 } }
    config:
      base: Dashboards/Bases/Tasks.base
      view: Active
  - id: readme
    type: markdown
    layout: { lg: { x: 8, y: 0, w: 4, h: 6 } }
    config:
      path: Home.md
  - id: docs
    type: web
    layout: { lg: { x: 0, y: 6, w: 12, h: 4 } }
    config:
      url: https://help.obsidian.md
```

---

## Suggerimenti e note

- **Crea prima i dati.** Per un widget Base, crea il file `.base` (e le sue viste) prima di puntarvi un widget. La skill di dashboard con IA lo fa in un unico passaggio.
- **Raggruppa per vista.** Riutilizza un `.base` su più widget Base (Active / Done / Backlog) invece di duplicare i dati.
- **Mantieni economici i widget di workflow.** Memorizzano i risultati nella cache; imposta un **intervallo di aggiornamento automatico** sensato invece di eseguirli a ogni apertura, e memorizza l'output in `result`.
- **Solo desktop.** Le dashboard (come il resto del plugin) funzionano su Obsidian desktop.
- **I file risiedono nel tuo vault.** Le dashboard vengono memorizzate in `Dashboards/` come file `.dashboard` e si sincronizzano/versionano con le tue note; la cache di workflow per dashboard risiede in un file sidecar nascosto accanto a ciascuna.

> Vedi anche: [Nodi di workflow](WORKFLOW_NODES_it.md) · [Skill di agente](SKILLS_it.md)
