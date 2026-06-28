# Dashboard

Crea una **pagina home / panoramica** personale da una griglia responsiva di widget. Una dashboard è un file `.dashboard` che organizza **viste Bases**, **note**, **pagine web**, **timeline**, **bacheche Kanban** e **output di workflow** in una griglia trascinabile e ridimensionabile. Aprila come qualsiasi nota per ottenere una bacheca live e modificabile.

![Dashboard](images/dashboard.png)

---

## Dashboard vs Canvas

Il **Canvas** di Obsidian e una Dashboard sembrano simili ma risolvono problemi diversi:

| | Dashboard | Canvas |
|---|-----------|--------|
| **Contenuto** | **Live** — viste Bases, timeline, bacheche Kanban, output di workflow e note si aggiornano | **Statico** — le schede sono snapshot posizionati manualmente |
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

Le dashboard sono memorizzate come semplici file `.dashboard` nel tuo vault, quindi si sincronizzano/versionano come qualsiasi altra nota. I risultati dei widget Workflow sono memorizzati separatamente in `Dashboards/Data/` come normali file del vault.

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

The same `.base` file can be referenced by multiple Base widgets — for example, one widget per view (Active / Done / Backlog). If the `.base` file changes outside the settings panel, the editor reloads it before saving so it does not overwrite newer content with stale state.

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
| **Show header** | Show a compact header with the URL and a browser-open button. Existing widgets default to on. |

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
> Los resultados se almacenan en `Dashboards/Data/<encoded dashboard path>.json` como archivo normal de la bóveda. Así la salida sobrevive a la reapertura sin inflar el archivo `.dashboard`, y puede sincronizarse, subirse/bajarse, revisarse o versionarse como cualquier otro archivo. El workflow debe almacenar su salida Markdown/HTML en una variable de cadena (predeterminado `result`) — no se admiten salidas de tarjetas/tablas. Como se ejecuta sin supervisión, no debe usar nodos interactivos (`prompt-*`, `dialog`).

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
| **Campi visualizzati** | Elenco ordinato di nomi di proprietà frontmatter mostrati su ogni scheda sotto il titolo (ad es. `priority`, `due`). Ciascuno viene mostrato come `name: value`; i valori vuoti vengono saltati e i valori di lista sono uniti con virgole. |
| **Mostra colonna delle schede non corrispondenti** | Se attivato, le schede il cui stato non corrisponde a nessuna colonna appaiono in una colonna aggiuntiva «Non specificato» (predefinito attivato). |

### Timeline — catturare post datati

Salva brevi post datati in `Dashboards/Timeline/<name>/`, un file Markdown per giorno. I post possono includere `#tag`, immagini allegate ed elementi fissati. Il widget mostra un feed in ordine cronologico inverso con filtri per testo/tag/data e un composer per nuovi post. I post lunghi e le note incorporate sono compressi per impostazione predefinita, con controlli **Mostra altro / Mostra meno**. Il composer e l'editor inline includono anche **Modifica con IA** accanto al pulsante per allegare immagini: inserisci un'istruzione, controlla il diff generato in una modale e poi applicalo alla textarea.

![Composer Timeline](images/timeline_input.png)

| Impostazione | Descrizione |
|---------|-------------|
| **Nome timeline** | Nome della cartella sotto `Dashboards/Timeline/` |
| **Post recenti da mostrare** | Numero iniziale di post recenti da mostrare prima di caricare elementi più vecchi |
| **Comprimi dopo le righe** | Soglia stimata di righe visibili per mostrare l'anteprima compressa (predefinito `8`) |
| **Comprimi dopo i caratteri** | Soglia di caratteri per mostrare l'anteprima compressa (predefinito `440`) |

Ogni file giornaliero si chiama `<YYYY-MM-DD>.md`. I post sono separati con `---` solo quando il separatore è seguito da un marker timeline o timestamp ISO, quindi le normali linee orizzontali Markdown nel corpo del post vengono conservate.

![Editor inline Timeline](images/timeline_edit.png)

Usa **Modifica con IA** dal composer o dall'editor inline per inviare al modello la bozza corrente e la tua istruzione. La riscrittura generata viene mostrata come diff prima di essere applicata alla textarea.

![Riscrittura Timeline con IA](images/timeline_ai.png)

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

- Per un widget **Base**, apre la finestra di creazione con IA per un file `.base`. L'IA può ispezionare le note con strumenti di sola lettura (leggi, cerca, elenca) per scoprire le proprietà frontmatter corrette prima della creazione; ad esempio, chiedere una vista a schede con immagini di copertina funziona senza nominare la proprietà. Se una base è già selezionata, il pulsante diventa **Modifica con l'IA**: mostra un **diff** della `.base` proposta rispetto a quella attuale, con un campo per **istruzioni aggiuntive** per rifinirla prima di **Applicare**.
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
    type: base | markdown | web | workflow | kanban | timeline
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
  showHeader: true                    # optional; false hides the URL/open header

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
  displayFields: [priority, due]       # frontmatter properties shown on each card
  cardOrder: [Tasks/A.md, Tasks/B.md]   # optional manual order persisted by drag/drop
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
# timeline
config:
  name: Journal                        # stores posts under Dashboards/Timeline/Journal/
  latestCount: 20
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
  - id: journal
    type: timeline
    layout: { lg: { x: 0, y: 10, w: 6, h: 6 } }
    config:
      name: Journal
      latestCount: 20
```

---

## Suggerimenti e note

- **Crea prima i dati.** Per un widget Base, crea il file `.base` (e le sue viste) prima di puntarvi un widget. La skill di dashboard con IA lo fa in un unico passaggio.
- **Raggruppa per vista.** Riutilizza un `.base` su più widget Base (Active / Done / Backlog) invece di duplicare i dati.
- **Mantieni economici i widget di workflow.** Memorizzano i risultati nella cache; imposta un **intervallo di aggiornamento automatico** sensato invece di eseguirli a ogni apertura, e memorizza l'output in `result`.
- **Solo desktop.** Le dashboard (come il resto del plugin) funzionano su Obsidian desktop.
- **I file risiedono nel tuo vault.** Le dashboard sono memorizzate in `Dashboards/` come file `.dashboard`, i risultati dei workflow in `Dashboards/Data/`, i post timeline in `Dashboards/Timeline/` e le Bases generate in `Dashboards/Bases/`. Sono normali file del vault e si sincronizzano/versionano con le tue note.

> Vedi anche: [Nodi di workflow](WORKFLOW_NODES_it.md) · [Skill di agente](SKILLS_it.md)
