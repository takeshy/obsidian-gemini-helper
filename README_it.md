# Gemini Helper per Obsidian

Assistente AI **gratuito e open-source** per Obsidian con **Chat**, **Automazione dei Workflow** e **RAG** basato su Google Gemini.

> **Questo plugin è completamente gratuito.** Hai solo bisogno di una chiave API Google Gemini (gratuita o a pagamento) da [ai.google.dev](https://ai.google.dev), oppure puoi utilizzare strumenti CLI: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code) o [Codex CLI](https://github.com/openai/codex).

## Caratteristiche Principali

- **Chat AI** - Risposte in streaming, allegati, operazioni sul vault, comandi slash
- **Workflow Builder** - Automatizza attività multi-step con editor visuale e 22 tipi di nodi
- **Cronologia Modifiche** - Traccia e ripristina le modifiche fatte dall'AI con vista diff
- **RAG** - Retrieval-Augmented Generation per ricerca intelligente nel tuo vault
- **Ricerca Web** - Accedi a informazioni aggiornate tramite Google Search
- **Generazione di Immagini** - Crea immagini con i modelli Gemini

![Generazione di immagini nella chat](chat_image.png)

## Chiave API / Opzioni CLI

Questo plugin richiede una chiave API Google Gemini o uno strumento CLI. Puoi scegliere tra:

| Funzionalità | Chiave API Gratuita | Chiave API a Pagamento | CLI |
|--------------|---------------------|------------------------|-----|
| Chat base | ✅ | ✅ | ✅ |
| Operazioni sul vault | ✅ | ✅ | Solo Lettura/Ricerca |
| Ricerca Web | ✅ | ✅ | ❌ |
| RAG | ✅ (limitato) | ✅ | ❌ |
| Workflow | ✅ | ✅ | ✅ |
| Generazione Immagini | ❌ | ✅ | ❌ |
| Modelli | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| Costo | **Gratuito** | Pay per use | **Gratuito** |

> [!TIP]
> Le **Opzioni CLI** ti permettono di usare modelli flagship con un semplice account - nessuna chiave API necessaria!
> - **Gemini CLI**: Installa [Gemini CLI](https://github.com/google-gemini/gemini-cli), esegui `gemini` e autenticati con `/auth`
> - **Claude CLI**: Installa [Claude Code](https://github.com/anthropics/claude-code) (`npm install -g @anthropic-ai/claude-code`), esegui `claude` e autenticati
> - **Codex CLI**: Installa [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`), esegui `codex` e autenticati

### Suggerimenti per la Chiave API Gratuita

- I **limiti di frequenza** sono per modello e si resettano giornalmente. Cambia modello per continuare a lavorare.
- La **sincronizzazione RAG** è limitata. Esegui "Sync Vault" quotidianamente - i file già caricati vengono saltati.
- I **modelli Gemma** e **Gemini CLI** non supportano le operazioni sul vault nella Chat, ma **i Workflow possono comunque leggere/scrivere note** usando i tipi di nodo `note`, `note-read` e altri. Anche le variabili `{content}` e `{selection}` funzionano.

---

# Chat AI

La funzionalità Chat AI fornisce un'interfaccia di conversazione interattiva con Google Gemini, integrata con il tuo vault Obsidian.

![Interfaccia Chat](chat.png)

## Comandi Slash

Crea template di prompt riutilizzabili attivati con `/`:

- Definisci template con `{selection}` (testo selezionato) e `{content}` (nota attiva)
- Override opzionale di modello e ricerca per comando
- Digita `/` per vedere i comandi disponibili

**Default:** `/infographic` - Converte il contenuto in infografica HTML

![Esempio Infografica](chat_infographic.png)

## Menzioni con @

Fai riferimento a file e variabili digitando `@`:

- `{selection}` - Testo selezionato
- `{content}` - Contenuto della nota attiva
- Qualsiasi file del vault - Sfoglia e inserisci (solo percorso; l'AI legge il contenuto tramite strumenti)

> [!NOTE]
> Le menzioni @ dei file del vault inseriscono solo il percorso del file - l'AI legge il contenuto tramite strumenti. Questo non funziona con i modelli Gemma (nessun supporto per strumenti vault). Gemini CLI può leggere file via shell, ma il formato della risposta potrebbe differire.

## Allegati

Allega file direttamente: Immagini (PNG, JPEG, GIF, WebP), PDF, file di testo

## Function Calling (Operazioni sul Vault)

L'AI può interagire con il tuo vault usando questi strumenti:

| Strumento | Descrizione |
|-----------|-------------|
| `read_note` | Legge il contenuto di una nota |
| `create_note` | Crea nuove note |
| `propose_edit` | Modifica con dialogo di conferma |
| `propose_delete` | Elimina con dialogo di conferma |
| `bulk_propose_edit` | Modifica multipla di file con dialogo di selezione |
| `bulk_propose_delete` | Eliminazione multipla di file con dialogo di selezione |
| `search_notes` | Cerca nel vault per nome o contenuto |
| `list_notes` | Elenca le note in una cartella |
| `rename_note` | Rinomina/sposta note |
| `create_folder` | Crea nuove cartelle |
| `list_folders` | Elenca le cartelle nel vault |
| `get_active_note_info` | Ottiene informazioni sulla nota attiva |
| `get_rag_sync_status` | Controlla lo stato della sincronizzazione RAG |

### Modalità Strumenti Vault

Controlla quali strumenti del vault può usare l'AI tramite l'icona del database (📦) sotto il pulsante allegati:

| Modalità | Descrizione | Strumenti Disponibili |
|----------|-------------|----------------------|
| **Vault: Tutti** | Accesso completo al vault | Tutti gli strumenti |
| **Vault: Senza ricerca** | Esclude gli strumenti di ricerca | Tutti tranne `search_notes`, `list_notes` |
| **Vault: Disattivato** | Nessun accesso al vault | Nessuno |

**Selezione automatica della modalità:**

| Condizione | Modalità Predefinita | Modificabile |
|------------|---------------------|--------------|
| Modelli CLI (Gemini/Claude/Codex CLI) | Vault: Disattivato | No |
| Modelli Gemma | Vault: Disattivato | No |
| Web Search abilitata | Vault: Disattivato | No |
| Flash Lite + RAG | Vault: Disattivato | No |
| RAG abilitato | Vault: Senza ricerca | Sì |
| Nessun RAG | Vault: Tutti | Sì |

> **Suggerimento:** Quando usi RAG, è consigliato "Vault: Senza ricerca" per evitare ricerche ridondanti – RAG fornisce già la ricerca semantica in tutto il vault.

## Modifica Sicura

Quando l'AI usa `propose_edit`:
1. Un dialogo di conferma mostra le modifiche proposte
2. Clicca **Applica** per scrivere le modifiche nel file
3. Clicca **Annulla** per cancellare senza modificare il file

> Le modifiche NON vengono scritte finché non confermi.

## Cronologia Modifiche

Traccia e ripristina le modifiche apportate alle tue note:

- **Tracciamento automatico** - Tutte le modifiche AI (chat, workflow) e le modifiche manuali vengono registrate
- **Visualizza cronologia** - Comando: "Show edit history" o usa la palette comandi
- **Vista diff** - Vedi esattamente cosa è cambiato con aggiunte/eliminazioni colorate
- **Ripristina** - Torna a qualsiasi versione precedente con un clic
- **Modale ridimensionabile** - Trascina per spostare, ridimensiona dagli angoli

**Visualizzazione diff:**
- Le righe `+` esistevano nella versione precedente
- Le righe `-` sono state aggiunte nella versione più recente

**Come funziona:**

La cronologia modifiche usa un approccio basato su snapshot:

1. **Creazione snapshot** - Quando un file viene aperto per la prima volta o modificato dall'AI, viene salvato uno snapshot del suo contenuto
2. **Registrazione diff** - Quando il file viene modificato, la differenza tra il nuovo contenuto e lo snapshot viene registrata come voce della cronologia
3. **Aggiornamento snapshot** - Lo snapshot viene aggiornato al nuovo contenuto dopo ogni modifica
4. **Ripristino** - Per ripristinare una versione precedente, i diff vengono applicati al contrario dallo snapshot

**Quando viene registrata la cronologia:**
- Modifiche chat AI (strumento `propose_edit`)
- Modifiche note workflow (nodo `note`)
- Salvataggi manuali tramite comando
- Auto-rilevamento quando il file differisce dallo snapshot all'apertura

**Posizione di archiviazione:**
- File cronologia: `{workspaceFolder}/history/{filename}.history.md`
- File snapshot: `{workspaceFolder}/history/{filename}.snapshot.md`

**Impostazioni:**
- Abilita/disabilita nelle impostazioni del plugin
- Configura le righe di contesto per i diff
- Imposta i limiti di conservazione (max voci per file, età massima)

![Modale Cronologia Modifiche](edit_history.png)

## RAG

Retrieval-Augmented Generation per ricerca intelligente nel vault:

- **File supportati** - Markdown, PDF, Immagini (PNG, JPEG, GIF, WebP)
- **Modalità interna** - Sincronizza i file del vault con Google File Search
- **Modalità esterna** - Usa ID di store esistenti
- **Sincronizzazione incrementale** - Carica solo i file modificati
- **Cartelle target** - Specifica le cartelle da includere
- **Pattern di esclusione** - Pattern regex per escludere file

![Impostazioni RAG](setting_rag.png)

---

# Workflow Builder

Costruisci workflow automatizzati multi-step direttamente nei file Markdown. **Non è richiesta conoscenza di programmazione** - descrivi semplicemente ciò che vuoi in linguaggio naturale, e l'AI creerà il workflow per te.

![Editor Visuale dei Workflow](visual_workflow.png)

## Creazione di Workflow con AI

**Non hai bisogno di imparare la sintassi YAML o i tipi di nodo.** Descrivi semplicemente il tuo workflow in linguaggio naturale:

1. Apri la scheda **Workflow** nella sidebar di Gemini
2. Seleziona **+ New (AI)** dal menu a tendina
3. Descrivi cosa vuoi: *"Crea un workflow che riassuma la nota selezionata e la salvi in una cartella summaries"*
4. Clicca **Generate** - l'AI crea il workflow completo

![Crea Workflow con AI](create_workflow_with_ai.png)

**Modifica i workflow esistenti allo stesso modo:**
1. Carica un workflow qualsiasi
2. Clicca il pulsante **AI Modify**
3. Descrivi le modifiche: *"Aggiungi uno step per tradurre il riassunto in giapponese"*
4. Rivedi e applica

![Modifica Workflow con AI](modify_workflow_with_ai.png)

## Guida Rapida (Manuale)

Puoi anche scrivere workflow manualmente. Aggiungi un blocco di codice workflow a qualsiasi file Markdown:

````markdown
```workflow
name: Quick Summary
nodes:
  - id: input
    type: dialog
    title: Enter topic
    inputTitle: Topic
    saveTo: topic
  - id: generate
    type: command
    prompt: "Write a brief summary about {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Apri la scheda **Workflow** nella sidebar di Gemini per eseguirlo.

## Tipi di Nodo Disponibili

22 tipi di nodo sono disponibili per costruire workflow:

| Categoria | Nodi |
|-----------|------|
| Variabili | `variable`, `set` |
| Controllo | `if`, `while` |
| LLM | `command` |
| Dati | `http`, `json` |
| Note | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| File | `file-explorer`, `file-save` |
| Prompt | `prompt-file`, `prompt-selection`, `dialog` |
| Composizione | `workflow` |
| RAG | `rag-sync` |
| Esterni | `mcp`, `obsidian-command` |

> **Per specifiche dettagliate sui nodi ed esempi, consulta [WORKFLOW_NODES.md](WORKFLOW_NODES_it.md)**

## Modalità Hotkey

Assegna scorciatoie da tastiera per eseguire workflow istantaneamente:

1. Aggiungi un campo `name:` al tuo workflow
2. Apri il file del workflow e seleziona il workflow dal menu a tendina
3. Clicca l'icona della tastiera (⌨️) nel footer del pannello Workflow
4. Vai in Impostazioni → Hotkeys → cerca "Workflow: [Nome del Tuo Workflow]"
5. Assegna un hotkey (es. `Ctrl+Shift+T`)

Quando attivato da hotkey:
- `prompt-file` usa automaticamente il file attivo (nessun dialogo)
- `prompt-selection` usa la selezione corrente, o il contenuto completo del file se non c'è selezione

## Trigger degli Eventi

I workflow possono essere attivati automaticamente dagli eventi di Obsidian:

![Impostazioni Trigger Eventi](event_setting.png)

| Evento | Descrizione |
|--------|-------------|
| File Created | Attivato quando viene creato un nuovo file |
| File Modified | Attivato quando un file viene salvato (debounced 5s) |
| File Deleted | Attivato quando un file viene eliminato |
| File Renamed | Attivato quando un file viene rinominato |
| File Opened | Attivato quando un file viene aperto |

**Configurazione trigger eventi:**
1. Aggiungi un campo `name:` al tuo workflow
2. Apri il file del workflow e seleziona il workflow dal menu a tendina
3. Clicca l'icona del fulmine (⚡) nel footer del pannello Workflow
4. Seleziona quali eventi devono attivare il workflow
5. Opzionalmente aggiungi un filtro per pattern di file

**Esempi di pattern file:**
- `**/*.md` - Tutti i file Markdown in qualsiasi cartella
- `journal/*.md` - File Markdown solo nella cartella journal
- `*.md` - File Markdown solo nella cartella root
- `**/{daily,weekly}/*.md` - File nelle cartelle daily o weekly
- `projects/[a-z]*.md` - File che iniziano con lettera minuscola

**Variabili degli eventi:** Quando attivato da un evento, queste variabili vengono impostate automaticamente:

| Variabile | Descrizione |
|-----------|-------------|
| `__eventType__` | Tipo di evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Percorso del file interessato |
| `__eventFile__` | JSON con informazioni sul file (path, basename, name, extension) |
| `__eventFileContent__` | Contenuto del file (per eventi create/modify/file-open) |
| `__eventOldPath__` | Percorso precedente (solo per eventi rename) |

> **Nota:** I nodi `prompt-file` e `prompt-selection` usano automaticamente il file dell'evento quando attivati da eventi. `prompt-selection` usa l'intero contenuto del file come selezione.

---

# Comune

## Modelli Supportati

### Piano a Pagamento
| Modello | Descrizione |
|---------|-------------|
| Gemini 3 Flash Preview | Modello veloce, contesto 1M (default) |
| Gemini 3 Pro Preview | Modello flagship, contesto 1M |
| Gemini 2.5 Flash Lite | Modello flash leggero |
| Gemini 2.5 Flash (Image) | Generazione immagini, 1024px |
| Gemini 3 Pro (Image) | Generazione immagini Pro, 4K |

### Piano Gratuito
| Modello | Operazioni sul Vault |
|---------|----------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Installazione

### BRAT (Consigliato)
1. Installa il plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Apri le impostazioni BRAT → "Add Beta plugin"
3. Inserisci: `https://github.com/takeshy/obsidian-gemini-helper`
4. Abilita il plugin nelle impostazioni dei Community plugins

### Manuale
1. Scarica `main.js`, `manifest.json`, `styles.css` dalle release
2. Crea la cartella `gemini-helper` in `.obsidian/plugins/`
3. Copia i file e abilita nelle impostazioni di Obsidian

### Da Sorgente
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configurazione

### Impostazioni API
1. Ottieni la chiave API da [ai.google.dev](https://ai.google.dev)
2. Inseriscila nelle impostazioni del plugin
3. Seleziona il piano API (Gratuito/A pagamento)

![Impostazioni Base](setting_basic.png)

### Modalità CLI (Gemini / Claude / Codex)

**Gemini CLI:**
1. Installa [Gemini CLI](https://github.com/google-gemini/gemini-cli)
2. Autenticati con `gemini` → `/auth`
3. Clicca "Verify" nella sezione Gemini CLI

**Claude CLI:**
1. Installa [Claude Code](https://github.com/anthropics/claude-code): `npm install -g @anthropic-ai/claude-code`
2. Autenticati con `claude`
3. Clicca "Verify" nella sezione Claude CLI

**Codex CLI:**
1. Installa [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
2. Autenticati con `codex`
3. Clicca "Verify" nella sezione Codex CLI

**Limitazioni CLI:** Operazioni vault in sola lettura, nessuna ricerca semantica/web

### Impostazioni Workspace
- **Workspace Folder** - Posizione della cronologia chat e impostazioni
- **System Prompt** - Istruzioni aggiuntive per l'AI
- **Tool Limits** - Controlla i limiti delle function call
- **Edit History** - Traccia e ripristina le modifiche fatte dall'AI

![Limiti Strumenti e Cronologia Modifiche](setting_tool_history.png)

### Comandi Slash
- Definisci template di prompt personalizzati attivati con `/`
- Override opzionale di modello e ricerca per comando

![Comandi Slash](setting_slash_command.png)

## Utilizzo

### Aprire la Chat
- Clicca l'icona Gemini nel ribbon
- Comando: "Gemini Helper: Open chat"
- Toggle: "Gemini Helper: Toggle chat / editor"

### Controlli della Chat
- **Invio** - Invia messaggio
- **Shift+Invio** - Nuova riga
- **Pulsante Stop** - Ferma la generazione
- **Pulsante +** - Nuova chat
- **Pulsante Cronologia** - Carica chat precedenti

### Usare i Workflow
1. Apri la scheda **Workflow** nella sidebar
2. Apri un file con blocco di codice `workflow`
3. Seleziona il workflow dal menu a tendina
4. Clicca **Run** per eseguire
5. Clicca **History** per vedere le esecuzioni passate

![Cronologia Workflow](workflow_history.png)

**Visualizza come Diagramma di Flusso:** Clicca il pulsante **Canvas** (icona griglia) nel pannello Workflow per esportare il tuo workflow come Canvas Obsidian. Questo crea un diagramma di flusso visivo dove:
- Loop e ramificazioni sono mostrati chiaramente con routing appropriato
- I nodi decisionali (`if`/`while`) mostrano i percorsi Sì/No
- Le frecce di ritorno sono instradate attorno ai nodi per chiarezza
- Ogni nodo mostra la sua configurazione completa
- È incluso un link al file workflow di origine per una navigazione rapida

![Workflow to Canvas](workflow_to_canvas.png)

Questo è particolarmente utile per comprendere workflow complessi con più ramificazioni e loop.

**Esporta Cronologia Esecuzione:** Visualizza la cronologia di esecuzione come Canvas Obsidian per analisi visuale.

![Vista Cronologia Canvas](history_canvas.png)

### Generazione di Workflow con AI

**Crea Nuovo Workflow con AI:**
1. Seleziona **+ New (AI)** dal menu a tendina dei workflow
2. Inserisci il nome del workflow e il percorso di output (supporta la variabile `{{name}}`)
3. Descrivi cosa dovrebbe fare il workflow in linguaggio naturale
4. Seleziona un modello e clicca **Generate**
5. Il workflow viene automaticamente creato e salvato

**Riferimenti File con @:**

Digita `@` nel campo descrizione per riferire file:
- `@{selection}` - Selezione corrente dell'editor
- `@{content}` - Contenuto della nota attiva
- `@path/to/file.md` - Qualsiasi file del vault

Quando clicchi Generate, il contenuto del file viene incorporato direttamente nella richiesta AI. Il frontmatter YAML viene automaticamente rimosso.

> **Suggerimento:** Questo è utile per creare workflow basati su esempi o template di workflow esistenti nel tuo vault.

**Cronologia Richieste:**

Ogni workflow generato da AI salva una voce di cronologia sopra il blocco di codice del workflow, includendo:
- Timestamp e azione (Creato/Modificato)
- La tua descrizione della richiesta
- Contenuti dei file riferiti (in sezioni collassabili)

![Cronologia AI del Workflow](workflow_ai_history.png)

**Modifica Workflow Esistente con AI:**
1. Carica un workflow esistente
2. Clicca il pulsante **AI Modify** (icona scintilla)
3. Descrivi le modifiche che vuoi
4. Rivedi il confronto prima/dopo
5. Clicca **Apply Changes** per aggiornare

![Modifica Workflow con AI](modify_workflow_with_ai.png)

**Modifica Manuale dei Workflow:**

Modifica i workflow direttamente nell'editor visuale dei nodi con interfaccia drag-and-drop.

![Modifica Manuale Workflow](modify_workflow_manual.png)

**Ricarica da File:**
- Seleziona **Reload from file** dal menu a tendina per reimportare il workflow dal file markdown

## Requisiti

- Obsidian v0.15.0+
- Chiave API Google AI, o strumento CLI (Gemini CLI / Claude CLI / Codex CLI)
- Desktop e mobile supportati (modalità CLI: solo desktop)

## Privacy

**Dati archiviati localmente:**
- Chiave API (archiviata nelle impostazioni di Obsidian)
- Cronologia chat (come file Markdown)
- Cronologia esecuzione workflow

**Dati inviati a Google:**
- Tutti i messaggi della chat e gli allegati vengono inviati all'API Google Gemini per l'elaborazione
- Quando RAG è abilitato, i file del vault vengono caricati su Google File Search
- Quando la Ricerca Web è abilitata, le query vengono inviate a Google Search

**Dati inviati a servizi di terze parti:**
- I nodi `http` dei workflow possono inviare dati a qualsiasi URL specificato nel workflow

**Provider CLI (opzionali):**
- Quando la modalità CLI è abilitata, strumenti CLI esterni (gemini, claude, codex) vengono eseguiti tramite child_process
- Questo avviene solo quando esplicitamente configurato e verificato dall'utente
- La modalità CLI è solo desktop (non disponibile su mobile)

**Note sulla sicurezza:**
- Rivedi i workflow prima di eseguirli - i nodi `http` possono trasmettere dati del vault a endpoint esterni
- I nodi `note` dei workflow mostrano un dialogo di conferma prima di scrivere file (comportamento predefinito)
- I comandi slash con `confirmEdits: false` applicheranno automaticamente le modifiche ai file senza mostrare i pulsanti Applica/Annulla

Consulta i [Termini di Servizio Google AI](https://ai.google.dev/terms) per le politiche di conservazione dei dati.

## Licenza

MIT

## Link

- [Documentazione API Gemini](https://ai.google.dev/docs)
- [Documentazione Plugin Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Supporto

Se trovi utile questo plugin, considera di offrirmi un caffè!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
