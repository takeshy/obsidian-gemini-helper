# Gemini Helper per Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

Assistente AI **gratuito e open-source** per Obsidian con **Chat**, **Automazione dei Workflow** e **RAG** basato su Google Gemini.

> **Questo plugin è completamente gratuito.** Hai solo bisogno di una chiave API Google Gemini (gratuita o a pagamento) da [ai.google.dev](https://ai.google.dev), oppure puoi utilizzare strumenti CLI: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code) o [Codex CLI](https://github.com/openai/codex).

## Caratteristiche Principali

- **Chat AI** - Risposte in streaming, allegati, operazioni sul vault, comandi slash
- **Workflow Builder** - Automatizza attività multi-step con editor visuale e 23 tipi di nodi
- **Cronologia Modifiche** - Traccia e ripristina le modifiche fatte dall'AI con vista diff
- **RAG** - Retrieval-Augmented Generation per ricerca intelligente nel tuo vault
- **Ricerca Web** - Accedi a informazioni aggiornate tramite Google Search
- **Generazione di Immagini** - Crea immagini con i modelli Gemini
- **Crittografia** - Proteggi con password la cronologia chat e i log di esecuzione dei workflow

![Generazione di immagini nella chat](docs/images/chat_image.png)

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

![Interfaccia Chat](docs/images/chat.png)

## Comandi Slash

Crea template di prompt riutilizzabili attivati con `/`:

- Definisci template con `{selection}` (testo selezionato) e `{content}` (nota attiva)
- Override opzionale di modello e ricerca per comando
- Digita `/` per vedere i comandi disponibili

**Default:** `/infographic` - Converte il contenuto in infografica HTML

![Esempio Infografica](docs/images/chat_infographic.png)

## Menzioni con @

Fai riferimento a file e variabili digitando `@`:

- `{selection}` - Testo selezionato
- `{content}` - Contenuto della nota attiva
- Qualsiasi file del vault - Sfoglia e inserisci (solo percorso; l'AI legge il contenuto tramite strumenti)

> [!NOTE]
> **Come funzionano `{selection}` e `{content}`:** Quando passi dalla Vista Markdown alla Vista Chat, la selezione verrebbe normalmente cancellata a causa del cambio di focus. Per preservare la tua selezione, il plugin la cattura durante il cambio di vista ed evidenzia l'area selezionata con un colore di sfondo nella Vista Markdown. L'opzione `{selection}` appare nei suggerimenti @ solo quando è stato selezionato del testo.
>
> Sia `{selection}` che `{content}` **non vengono espansi** intenzionalmente nell'area di input—poiché l'input della chat è compatto, espandere testo lungo renderebbe difficile la digitazione. Il contenuto viene espanso quando invii il messaggio, cosa che puoi verificare controllando il tuo messaggio inviato nella chat.

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

Quando l'AI gestisce le note nella Chat, utilizza gli strumenti Vault. Controlla quali strumenti del vault può usare l'AI tramite l'icona del database (📦) sotto il pulsante allegati:

| Modalità | Descrizione | Strumenti Disponibili |
|----------|-------------|----------------------|
| **Vault: Tutti** | Accesso completo al vault | Tutti gli strumenti |
| **Vault: Senza ricerca** | Esclude gli strumenti di ricerca | Tutti tranne `search_notes`, `list_notes` |
| **Vault: Disattivato** | Nessun accesso al vault | Nessuno |

**Quando usare ogni modalità:**

- **Vault: Tutti** - Modalità predefinita per uso generale. L'AI può leggere, scrivere e cercare nel tuo vault.
- **Vault: Senza ricerca** - Usala quando vuoi cercare solo con RAG, o quando conosci già il file di destinazione. Questo evita ricerche ridondanti nel vault, risparmiando token e migliorando il tempo di risposta.
- **Vault: Disattivato** - Usala quando non hai bisogno di accesso al vault.

**Selezione automatica della modalità:**

| Condizione | Modalità Predefinita | Modificabile |
|------------|---------------------|--------------|
| Modelli CLI (Gemini/Claude/Codex CLI) | Vault: Disattivato | No |
| Modelli Gemma | Vault: Disattivato | No |
| Web Search abilitata | Vault: Disattivato | No |
| Flash Lite + RAG | Vault: Disattivato | No |
| RAG abilitato | Vault: Senza ricerca | Sì |
| Nessun RAG | Vault: Tutti | Sì |

**Perché alcune modalità sono forzate:**

- **Modelli CLI/Gemma**: Questi modelli non supportano le chiamate di funzione, quindi gli strumenti Vault non possono essere utilizzati.
- **Web Search**: Per design, gli strumenti Vault sono disabilitati quando Web Search è abilitata.
- **Flash Lite + RAG**: Quando sia RAG che gli strumenti Vault sono abilitati, i modelli Flash Lite si confondono e non funzionano correttamente. RAG viene automaticamente prioritizzato e gli strumenti Vault vengono disabilitati.

## Modifica Sicura

Quando l'AI usa `propose_edit`:
1. Un dialogo di conferma mostra le modifiche proposte
2. Clicca **Applica** per scrivere le modifiche nel file
3. Clicca **Annulla** per cancellare senza modificare il file

> Le modifiche NON vengono scritte finché non confermi.

## Cronologia Modifiche

Traccia e ripristina le modifiche apportate alle tue note:

- **Tracciamento automatico** - Tutte le modifiche AI (chat, workflow) e le modifiche manuali vengono registrate
- **Accesso dal menu file** - Clicca con il tasto destro su un file markdown per accedere a:
  - **Snapshot** - Salva lo stato attuale come snapshot
  - **History** - Apri il modale della cronologia modifiche

![Menu File](docs/images/snap_history.png)

- **Palette comandi** - Disponibile anche tramite il comando "Show edit history"
- **Vista diff** - Vedi esattamente cosa è cambiato con aggiunte/eliminazioni colorate
- **Ripristina** - Torna a qualsiasi versione precedente con un clic
- **Copia** - Salva una versione storica come nuovo file (nome predefinito: `{filename}_{datetime}.md`)
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

![Modale Cronologia Modifiche](docs/images/edit_history.png)

## RAG

Retrieval-Augmented Generation per ricerca intelligente nel vault:

- **File supportati** - Markdown, PDF, Immagini (PNG, JPEG, GIF, WebP)
- **Modalità interna** - Sincronizza i file del vault con Google File Search
- **Modalità esterna** - Usa ID di store esistenti
- **Sincronizzazione incrementale** - Carica solo i file modificati
- **Cartelle target** - Specifica le cartelle da includere
- **Pattern di esclusione** - Pattern regex per escludere file

![Impostazioni RAG](docs/images/setting_rag.png)

## Server MCP

I server MCP (Model Context Protocol) forniscono strumenti aggiuntivi che estendono le capacità dell'AI oltre le operazioni del vault.

**Configurazione:**

1. Apri le impostazioni del plugin → sezione **Server MCP**
2. Clicca su **Aggiungi server**
3. Inserisci il nome e l'URL del server
4. Configura gli header opzionali (formato JSON) per l'autenticazione
5. Clicca su **Test connessione** per verificare e recuperare gli strumenti disponibili
6. Salva la configurazione del server

> **Nota:** Il test di connessione è obbligatorio prima del salvataggio. Questo garantisce che il server sia raggiungibile e mostra gli strumenti disponibili.

![Impostazioni Server MCP](docs/images/setting_mcp.png)

**Utilizzo degli strumenti MCP:**

- **Nella chat:** Clicca sull'icona del database (📦) per aprire le impostazioni degli strumenti. Abilita/disabilita i server MCP per conversazione.
- **Nei workflow:** Usa il nodo `mcp` per chiamare gli strumenti del server MCP.

**Suggerimenti strumenti:** Dopo un test di connessione riuscito, i nomi degli strumenti disponibili vengono salvati e visualizzati sia nelle impostazioni che nell'interfaccia della chat.

### MCP Apps (UI Interattiva)

Alcuni strumenti MCP restituiscono UI interattiva che permette di interagire visivamente con i risultati dello strumento. Questa funzionalità è basata sulla [specifica MCP Apps](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps).

![MCP Apps](docs/images/mcp_apps.png)

**Come funziona:**

- Quando uno strumento MCP restituisce un URI risorsa `ui://` nei metadati della risposta, il plugin recupera e renderizza il contenuto HTML
- L'UI viene visualizzata in un iframe sandboxed per sicurezza (`sandbox="allow-scripts allow-forms"`)
- Le applicazioni interattive possono chiamare strumenti MCP aggiuntivi e aggiornare il contesto tramite un bridge JSON-RPC

**Nella Chat:**
- MCP Apps appare inline nei messaggi dell'assistente con un pulsante espandi/comprimi
- Clicca su ⊕ per espandere a schermo intero, ⊖ per comprimere

**Nei Workflow:**
- MCP Apps viene visualizzato in una finestra di dialogo modale durante l'esecuzione del workflow
- Il workflow si mette in pausa per permettere l'interazione dell'utente, poi continua quando il modale viene chiuso

> **Sicurezza:** Tutto il contenuto MCP App viene eseguito in un iframe sandboxed con permessi limitati. L'iframe non può accedere al DOM della pagina padre, ai cookie o al localStorage. Solo `allow-scripts` e `allow-forms` sono abilitati.

---

# Workflow Builder

Costruisci workflow automatizzati multi-step direttamente nei file Markdown. **Non è richiesta conoscenza di programmazione** - descrivi semplicemente ciò che vuoi in linguaggio naturale, e l'AI creerà il workflow per te.

![Editor Visuale dei Workflow](docs/images/visual_workflow.png)

## Creazione di Workflow con AI

**Non hai bisogno di imparare la sintassi YAML o i tipi di nodo.** Descrivi semplicemente il tuo workflow in linguaggio naturale:

1. Apri la scheda **Workflow** nella sidebar di Gemini
2. Seleziona **+ New (AI)** dal menu a tendina
3. Descrivi cosa vuoi: *"Crea un workflow che riassuma la nota selezionata e la salvi in una cartella summaries"*
4. Clicca **Generate** - l'AI crea il workflow completo

![Crea Workflow con AI](docs/images/create_workflow_with_ai.png)

**Modifica i workflow esistenti allo stesso modo:**
1. Carica un workflow qualsiasi
2. Clicca il pulsante **AI Modify**
3. Descrivi le modifiche: *"Aggiungi uno step per tradurre il riassunto in giapponese"*
4. Rivedi e applica

![Modifica Workflow con AI](docs/images/modify_workflow_with_ai.png)

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

23 tipi di nodo sono disponibili per costruire workflow:

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
| Utilità | `sleep` |

> **Per specifiche dettagliate sui nodi ed esempi, consulta [WORKFLOW_NODES.md](docs/WORKFLOW_NODES_it.md)**

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

![Impostazioni Trigger Eventi](docs/images/event_setting.png)

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
| Gemini 2.5 Flash | Modello veloce, contesto 1M |
| Gemini 2.5 Pro | Modello Pro, contesto 1M |
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

![Impostazioni Base](docs/images/setting_basic.png)

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

**Percorso CLI personalizzato:** Se il rilevamento automatico del CLI fallisce, clicca sull'icona dell'ingranaggio (⚙️) accanto al pulsante Verify per specificare manualmente il percorso del CLI.

<details>
<summary><b>Windows: Come trovare il percorso del CLI</b></summary>

1. Apri PowerShell ed esegui:
   ```powershell
   Get-Command gemini
   ```
2. Questo mostra il percorso dello script (es: `C:\Users\YourName\AppData\Roaming\npm\gemini.ps1`)
3. Naviga dalla cartella `npm` all'effettivo `index.js`:
   ```
   C:\Users\YourName\AppData\Roaming\npm\node_modules\@google\gemini-cli\dist\index.js
   ```
4. Inserisci questo percorso completo nelle impostazioni del percorso CLI

Per Claude CLI, usa `Get-Command claude` e naviga a `node_modules\@anthropic-ai\claude-code\dist\index.js`.
</details>

> [!TIP]
> **Suggerimento per Claude CLI:** Le sessioni di chat da Gemini Helper vengono salvate localmente. Puoi continuare le conversazioni al di fuori di Obsidian eseguendo `claude --resume` nella directory del tuo vault per vedere e riprendere le sessioni precedenti.

### Impostazioni Workspace
- **Workspace Folder** - Posizione della cronologia chat e impostazioni
- **System Prompt** - Istruzioni aggiuntive per l'AI
- **Tool Limits** - Controlla i limiti delle function call
- **Edit History** - Traccia e ripristina le modifiche fatte dall'AI

![Limiti Strumenti e Cronologia Modifiche](docs/images/setting_tool_history.png)

### Crittografia

Proteggi la cronologia chat e i log di esecuzione dei workflow con password separatamente.

**Configurazione:**

1. Imposta una password nelle impostazioni del plugin (memorizzata in modo sicuro usando crittografia a chiave pubblica)

![Configurazione Iniziale Crittografia](docs/images/setting_initial_encryption.png)

2. Dopo la configurazione, attiva la crittografia per ogni tipo di log:
   - **Crittografa cronologia chat AI** - Crittografa i file delle conversazioni chat
   - **Crittografa log di esecuzione workflow** - Crittografa i file della cronologia workflow

![Impostazioni Crittografia](docs/images/setting_encryption.png)

Ogni impostazione può essere abilitata/disabilitata indipendentemente.

**Funzionalità:**
- **Controlli separati** - Scegli quali log crittografare (chat, workflow o entrambi)
- **Crittografia automatica** - I nuovi file vengono crittografati al salvataggio in base alle impostazioni
- **Cache password** - Inserisci la password una volta per sessione
- **Visualizzatore dedicato** - I file crittografati si aprono in un editor sicuro con anteprima
- **Opzione decrittografia** - Rimuovi la crittografia da singoli file quando necessario

**Come funziona:**

```
[Configurazione - una volta all'impostazione della password]
Password → Genera coppia di chiavi (RSA) → Crittografa chiave privata → Salva nelle impostazioni

[Crittografia - per ogni file]
Contenuto file → Crittografa con nuova chiave AES → Crittografa chiave AES con chiave pubblica
→ Salva nel file: dati crittografati + chiave privata crittografata (dalle impostazioni) + salt

[Decrittografia]
Password + salt → Ripristina chiave privata → Decrittografa chiave AES → Decrittografa contenuto
```

- La coppia di chiavi viene generata una volta (la generazione RSA è lenta), la chiave AES viene generata per ogni file
- Ogni file memorizza: contenuto crittografato + chiave privata crittografata (copiata dalle impostazioni) + salt
- I file sono autonomi — decrittografabili solo con la password, senza dipendenza dal plugin

<details>
<summary>Script Python di decrittografia (clicca per espandere)</summary>

```python
#!/usr/bin/env python3
"""Decrittografare file Gemini Helper senza il plugin."""
import base64, sys, re, getpass
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import padding

def decrypt_file(filepath: str, password: str) -> str:
    with open(filepath, 'r') as f:
        content = f.read()

    match = re.match(r'^---\n([\s\S]*?)\n---\n([\s\S]*)$', content)
    if not match:
        raise ValueError("Formato file crittografato non valido")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("Key o salt mancante nel frontmatter")

    enc_private_key = base64.b64decode(key_match.group(1).strip())
    salt = base64.b64decode(salt_match.group(1).strip())
    data = base64.b64decode(encrypted_data.strip())

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    derived_key = kdf.derive(password.encode())

    iv, enc_priv = enc_private_key[:12], enc_private_key[12:]
    private_key_pem = AESGCM(derived_key).decrypt(iv, enc_priv, None)
    private_key = serialization.load_der_private_key(base64.b64decode(private_key_pem), None)

    key_len = (data[0] << 8) | data[1]
    enc_aes_key = data[2:2+key_len]
    content_iv = data[2+key_len:2+key_len+12]
    enc_content = data[2+key_len+12:]

    aes_key = private_key.decrypt(enc_aes_key, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

    return AESGCM(aes_key).decrypt(content_iv, enc_content, None).decode('utf-8')

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Uso: {sys.argv[0]} <file_crittografato>")
        sys.exit(1)
    password = getpass.getpass("Password: ")
    print(decrypt_file(sys.argv[1], password))
```

Richiede: `pip install cryptography`

</details>

> **Avvertenza:** Se dimentichi la password, i file crittografati non possono essere recuperati. Conserva la password in modo sicuro.

> **Suggerimento:** Per crittografare tutti i file in una directory contemporaneamente, usa un workflow. Vedi l'esempio "Crittografa tutti i file in una directory" in [WORKFLOW_NODES_it.md](docs/WORKFLOW_NODES_it.md#obsidian-command).

![Flusso di Crittografia File](docs/images/enc.png)

**Vantaggi di sicurezza:**
- **Protetto dalla chat AI** - I file crittografati non possono essere letti dalle operazioni AI sul vault (strumento `read_note`). Questo mantiene i dati sensibili come le chiavi API al sicuro da esposizione accidentale durante la chat.
- **Accesso workflow con password** - I workflow possono leggere file crittografati usando il nodo `note-read`. Quando si accede, appare una finestra di dialogo per la password, e la password viene memorizzata nella cache per la sessione.
- **Archivia i segreti in sicurezza** - Invece di scrivere le chiavi API direttamente nei workflow, archiviale in file crittografati. Il workflow legge la chiave in fase di esecuzione dopo la verifica della password.

### Comandi Slash
- Definisci template di prompt personalizzati attivati con `/`
- Override opzionale di modello e ricerca per comando

![Comandi Slash](docs/images/setting_slash_command.png)

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

**Dalla Sidebar:**
1. Apri la scheda **Workflow** nella sidebar
2. Apri un file con blocco di codice `workflow`
3. Seleziona il workflow dal menu a tendina
4. Clicca **Run** per eseguire
5. Clicca **History** per vedere le esecuzioni passate

**Dalla Palette Comandi (Run Workflow):**

Usa il comando "Gemini Helper: Run Workflow" per navigare ed eseguire workflow da qualsiasi punto:

1. Apri la palette comandi e cerca "Run Workflow"
2. Naviga tra tutti i file del vault con blocchi di codice workflow (i file nella cartella `workflows/` sono mostrati per primi)
3. Visualizza l'anteprima del contenuto del workflow e la cronologia di generazione AI
4. Seleziona un workflow e clicca **Run** per eseguire

![Modal Esegui Workflow](docs/images/workflow_list.png)

Questo è utile per eseguire rapidamente workflow senza dover prima navigare al file del workflow.

![Cronologia Workflow](docs/images/workflow_history.png)

**Visualizza come Diagramma di Flusso:** Clicca il pulsante **Canvas** (icona griglia) nel pannello Workflow per esportare il tuo workflow come Canvas Obsidian. Questo crea un diagramma di flusso visivo dove:
- Loop e ramificazioni sono mostrati chiaramente con routing appropriato
- I nodi decisionali (`if`/`while`) mostrano i percorsi Sì/No
- Le frecce di ritorno sono instradate attorno ai nodi per chiarezza
- Ogni nodo mostra la sua configurazione completa
- È incluso un link al file workflow di origine per una navigazione rapida

![Workflow to Canvas](docs/images/workflow_to_canvas.png)

Questo è particolarmente utile per comprendere workflow complessi con più ramificazioni e loop.

**Esporta cronologia esecuzione:** Visualizza la cronologia di esecuzione come Canvas Obsidian per analisi visiva. Clicca su **Open Canvas view** nel modal Cronologia per creare un file Canvas.

> **Nota:** I file Canvas vengono creati dinamicamente nella cartella workspace. Eliminali manualmente dopo la revisione se non sono più necessari.

![Vista Cronologia Canvas](docs/images/history_canvas.png)

### Generazione di Workflow con AI

**Crea Nuovo Workflow con AI:**
1. Seleziona **+ New (AI)** dal menu a tendina dei workflow
2. Inserisci il nome del workflow e il percorso di output (supporta la variabile `{{name}}`)
3. Descrivi cosa dovrebbe fare il workflow in linguaggio naturale
4. Seleziona un modello e clicca **Generate**
5. Il workflow viene automaticamente creato e salvato

> **Suggerimento:** Quando usi **+ New (AI)** dal menu a tendina su un file che ha già workflow, il percorso di output viene impostato sul file corrente per default. Il workflow generato verrà aggiunto a quel file.

**Crea workflow da qualsiasi file:**

Quando apri la scheda Workflow con un file che non ha un blocco di codice workflow, viene mostrato un pulsante **"Create workflow with AI"**. Cliccalo per generare un nuovo workflow (output predefinito: `workflows/{{name}}.md`).

**Riferimenti File con @:**

Digita `@` nel campo descrizione per riferire file:
- `@{selection}` - Selezione corrente dell'editor
- `@{content}` - Contenuto della nota attiva
- `@path/to/file.md` - Qualsiasi file del vault

Quando clicchi Generate, il contenuto del file viene incorporato direttamente nella richiesta AI. Il frontmatter YAML viene automaticamente rimosso.

> **Suggerimento:** Questo è utile per creare workflow basati su esempi o template di workflow esistenti nel tuo vault.

**Allegati File:**

Clicca il pulsante allegati per allegare file (immagini, PDF, file di testo) alla tua richiesta di generazione workflow. Questo è utile per fornire contesto visivo o esempi all'AI.

**Controlli del Modal:**

Il modal del workflow AI supporta il posizionamento drag-and-drop e il ridimensionamento dagli angoli per una migliore esperienza di modifica.

**Cronologia Richieste:**

Ogni workflow generato da AI salva una voce di cronologia sopra il blocco di codice del workflow, includendo:
- Timestamp e azione (Creato/Modificato)
- La tua descrizione della richiesta
- Contenuti dei file riferiti (in sezioni collassabili)

![Cronologia AI del Workflow](docs/images/workflow_ai_history.png)

**Modifica Workflow Esistente con AI:**
1. Carica un workflow esistente
2. Clicca il pulsante **AI Modify** (icona scintilla)
3. Descrivi le modifiche che vuoi
4. Rivedi il confronto prima/dopo
5. Clicca **Apply Changes** per aggiornare

![Modifica Workflow con AI](docs/images/modify_workflow_with_ai.png)

**Riferimento alla Cronologia di Esecuzione:**

Quando modifichi un workflow con AI, puoi fare riferimento ai risultati delle esecuzioni precedenti per aiutare l'AI a capire i problemi:

1. Clicca il pulsante **Riferimento cronologia esecuzione**
2. Seleziona un'esecuzione dalla lista (le esecuzioni con errori sono evidenziate)
3. Scegli quali passaggi includere (i passaggi con errori sono preselezionati)
4. L'AI riceve i dati di input/output del passaggio per capire cosa è andato storto

Questo è particolarmente utile per il debug dei workflow - puoi dire all'AI "Correggi l'errore nel passaggio 2" e vedrà esattamente quale input ha causato l'errore.

**Cronologia Richieste:**

Quando rigeneri un workflow (cliccando "No" nell'anteprima), tutte le richieste precedenti della sessione vengono passate all'AI. Questo aiuta l'AI a capire il contesto completo delle tue modifiche attraverso più iterazioni.

**Modifica Manuale dei Workflow:**

Modifica i workflow direttamente nell'editor visuale dei nodi con interfaccia drag-and-drop.

![Modifica Manuale Workflow](docs/images/modify_workflow_manual.png)

**Ricarica da File:**
- Seleziona **Reload from file** dal menu a tendina per reimportare il workflow dal file markdown

## Requisiti

- Obsidian v0.15.0+
- Chiave API Google AI, o strumento CLI (Gemini CLI / Claude CLI / Codex CLI)
- Desktop e mobile supportati (modalità CLI: solo desktop)

## Privacy

**Dati memorizzati localmente:**
- Chiave API (memorizzata nelle impostazioni Obsidian)
- Cronologia chat (come file Markdown, opzionalmente crittografati)
- Cronologia esecuzione workflow (opzionalmente crittografata)
- Chiavi di crittografia (chiave privata crittografata con la tua password)

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

**Server MCP (opzionali):**
- I server MCP (Model Context Protocol) possono essere configurati nelle impostazioni del plugin per i nodi `mcp` dei workflow
- I server MCP sono servizi esterni che forniscono strumenti e capacità aggiuntive

**Note sulla sicurezza:**
- Rivedi i workflow prima di eseguirli - i nodi `http` possono trasmettere dati del vault a endpoint esterni
- I nodi `note` dei workflow mostrano un dialogo di conferma prima di scrivere file (comportamento predefinito)
- I comandi slash con `confirmEdits: false` applicheranno automaticamente le modifiche ai file senza mostrare i pulsanti Applica/Annulla
- Credenziali sensibili: Non memorizzare chiavi API o token direttamente nel YAML del workflow (header `http`, impostazioni `mcp`, ecc.). Invece, conservali in file crittografati e usa il nodo `note-read` per recuperarli durante l'esecuzione. I workflow possono leggere file crittografati con richiesta di password.

Consulta i [Termini di Servizio Google AI](https://ai.google.dev/terms) per le politiche di conservazione dei dati.

## Licenza

MIT

## Link

- [Documentazione API Gemini](https://ai.google.dev/docs)
- [Documentazione Plugin Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Supporto

Se trovi utile questo plugin, considera di offrirmi un caffè!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
