# Riferimento Nodi del Workflow

Questo documento fornisce specifiche dettagliate per tutti i tipi di nodi del workflow. Per la maggior parte degli utenti, **non è necessario imparare questi dettagli** - basta descrivere ciò che si desidera in linguaggio naturale, e l'AI creerà o modificherà i workflow automaticamente.

## Panoramica dei Tipi di Nodi

| Categoria | Nodi | Descrizione |
|-----------|------|-------------|
| Variabili | `variable`, `set` | Dichiarare e aggiornare variabili |
| Controllo | `if`, `while` | Ramificazione condizionale e cicli |
| LLM | `command` | Eseguire prompt con opzioni di modello/ricerca |
| Dati | `http`, `json` | Richieste HTTP e parsing JSON |
| Note | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Operazioni sul vault |
| File | `file-explorer`, `file-save` | Selezione e salvataggio file (immagini, PDF, ecc.) |
| Input | `prompt-file`, `prompt-selection`, `dialog` | Finestre di dialogo per input utente |
| Composizione | `workflow` | Eseguire un altro workflow come sub-workflow |
| RAG | `rag-sync` | Sincronizzare note con lo store RAG |
| Esterni | `mcp`, `obsidian-command` | Chiamare server MCP esterni o comandi Obsidian |
| Utilità | `sleep` | Mettere in pausa l'esecuzione del workflow |

---

## Opzioni Workflow

Puoi aggiungere una sezione `options` per controllare il comportamento del workflow:

```yaml
name: My Workflow
options:
  showProgress: false  # Nascondere la finestra modale di avanzamento (default: true)
nodes:
  - id: step1
    type: command
    ...
```

| Opzione | Tipo | Default | Descrizione |
|---------|------|---------|-------------|
| `showProgress` | boolean | `true` | Mostra la finestra modale di avanzamento quando si esegue tramite hotkey o lista workflow |

**Nota:** L'opzione `showProgress` influisce solo sull'esecuzione tramite hotkey o lista workflow. Il pannello Workflow Visuale mostra sempre l'avanzamento.

---

## Riferimento Nodi

### command

Esegue un prompt LLM con opzioni di modello, ricerca, strumenti vault e MCP opzionali.

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # Opzionale: modello specifico
  ragSetting: __websearch__      # Opzionale: __websearch__, __none__, o nome impostazione
  vaultTools: all                # Opzionale: all, noSearch, none
  mcpServers: "server1,server2"  # Opzionale: nomi server MCP separati da virgola
  prompt: "Search for {{topic}}"
  saveTo: result
```

| Proprietà | Descrizione |
|-----------|-------------|
| `prompt` | Il prompt da inviare all'LLM (obbligatorio) |
| `model` | Sovrascrive il modello corrente (i modelli disponibili dipendono dall'impostazione del piano API) |
| `ragSetting` | `__websearch__` (ricerca web), `__none__` (nessuna ricerca), nome impostazione RAG, o ometti per corrente |
| `vaultTools` | Modalità strumenti vault: `all` (ricerca + lettura/scrittura), `noSearch` (solo lettura/scrittura), `none` (disabilitato). Predefinito: `all` |
| `mcpServers` | Nomi server MCP separati da virgola da abilitare (devono essere configurati nelle impostazioni del plugin) |
| `attachments` | Nomi di variabili separati da virgola contenenti FileExplorerData (dal nodo `file-explorer`) |
| `saveTo` | Nome variabile per salvare la risposta testuale |
| `saveImageTo` | Nome variabile per salvare l'immagine generata (formato FileExplorerData, per modelli di immagini) |

**Esempio generazione immagine**:
```yaml
- id: generate
  type: command
  prompt: "Generate a cute cat illustration"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
```

**Modelli CLI:**

Puoi usare modelli CLI (`gemini-cli`, `claude-cli`, `codex-cli`) nei workflow se il CLI e configurato nelle impostazioni del plugin. I modelli CLI sono utili per accedere ai modelli di punta senza costi API.

```yaml
- id: analyze
  type: command
  model: claude-cli
  prompt: "Analizza questo codice:\n\n{{code}}"
  saveTo: analysis
```

> **Nota:** I modelli CLI non supportano RAG, ricerca web o generazione di immagini. Le proprieta `ragSetting` e `saveImageTo` vengono ignorate per i modelli CLI.

### note

Scrive contenuto in un file nota.

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| Proprietà | Descrizione |
|-----------|-------------|
| `path` | Percorso del file (obbligatorio) |
| `content` | Contenuto da scrivere |
| `mode` | `overwrite` (default), `append`, o `create` (salta se esiste) |
| `confirm` | `true` (default) mostra finestra di conferma, `false` scrive immediatamente |
| `history` | `true` (default, segue impostazione globale) salva nella cronologia modifiche, `false` disabilita cronologia per questa scrittura |

### note-read

Legge il contenuto da un file nota.

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| Proprietà | Descrizione |
|-----------|-------------|
| `path` | Percorso del file da leggere (obbligatorio) |
| `saveTo` | Nome variabile per salvare il contenuto del file (obbligatorio) |

**Supporto File Crittografati:**

Se il file di destinazione è crittografato (tramite la funzionalità di crittografia del plugin), il workflow automaticamente:
1. Controlla se la password è già memorizzata nella sessione corrente
2. Se non è memorizzata, richiede all'utente di inserire la password
3. Decrittografa il contenuto del file e lo memorizza nella variabile
4. Memorizza la password per le letture successive (all'interno della stessa sessione di Obsidian)

Una volta inserita la password, non è necessario reinserirla per altre letture di file crittografati fino al riavvio di Obsidian.

**Esempio: Leggere chiave API da file crittografato e chiamare API esterna**

Questo workflow legge una chiave API memorizzata in un file crittografato, chiama un'API esterna e mostra il risultato:

```yaml
name: Chiama API con chiave crittografata
nodes:
  - id: read-key
    type: note-read
    path: "secrets/api-key.md"
    saveTo: apiKey
    next: call-api

  - id: call-api
    type: http
    url: "https://api.example.com/data"
    method: GET
    headers: '{"Authorization": "Bearer {{apiKey}}"}'
    saveTo: response
    next: show-result

  - id: show-result
    type: dialog
    title: Risposta API
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **Suggerimento:** Memorizza i dati sensibili come le chiavi API in file crittografati. Usa il comando "Crittografa file" dalla palette dei comandi per crittografare un file contenente i tuoi segreti.

### note-list

Elenca le note con filtri e ordinamento.

```yaml
- id: list
  type: note-list
  folder: "Projects"
  recursive: true
  tags: "todo, project"
  tagMatch: all
  createdWithin: "7d"
  modifiedWithin: "24h"
  sortBy: modified
  sortOrder: desc
  limit: 20
  saveTo: noteList
```

| Proprietà | Descrizione |
|-----------|-------------|
| `folder` | Percorso cartella (vuoto per l'intero vault) |
| `recursive` | `true` include sottocartelle, `false` (default) solo figli diretti |
| `tags` | Tag separati da virgola per filtrare (con o senza `#`) |
| `tagMatch` | `any` (default) o `all` i tag devono corrispondere |
| `createdWithin` | Filtra per data di creazione: `30m`, `24h`, `7d` |
| `modifiedWithin` | Filtra per data di modifica |
| `sortBy` | `created`, `modified`, o `name` |
| `sortOrder` | `asc` o `desc` (default) |
| `limit` | Massimo risultati (default: 50) |
| `saveTo` | Variabile per i risultati |

**Formato output:**
```json
{
  "count": 5,
  "totalCount": 12,
  "hasMore": true,
  "notes": [
    {"name": "Note1", "path": "folder/Note1.md", "created": 1234567890, "modified": 1234567900, "tags": ["#todo"]}
  ]
}
```

### note-search

Cerca note per nome o contenuto.

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| Proprieta | Descrizione |
|-----------|-------------|
| `query` | Stringa di query di ricerca (richiesto, supporta `{{variables}}`) |
| `searchContent` | `true` cerca nel contenuto dei file, `false` (default) cerca solo nei nomi dei file |
| `limit` | Massimo risultati (default: 10) |
| `saveTo` | Variabile per i risultati (richiesto) |

**Formato output:**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...contesto intorno alla corrispondenza..."}
  ]
}
```

Quando `searchContent` e `true`, `matchedContent` include circa 50 caratteri prima e dopo la corrispondenza per contesto.

### folder-list

Elenca le cartelle nel vault.

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| Proprieta | Descrizione |
|-----------|-------------|
| `folder` | Percorso della cartella padre (vuoto per l'intero vault) |
| `saveTo` | Variabile per i risultati (richiesto) |

**Formato output:**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

Le cartelle sono ordinate alfabeticamente.

### open

Apre un file in Obsidian.

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| Proprieta | Descrizione |
|-----------|-------------|
| `path` | Percorso del file da aprire (richiesto, supporta `{{variables}}`) |

Se il percorso non ha estensione `.md`, viene aggiunta automaticamente.

### http

Effettua richieste HTTP.

```yaml
- id: fetch
  type: http
  url: "https://api.example.com/data"
  method: POST
  contentType: json
  headers: '{"Authorization": "Bearer {{token}}"}'
  body: '{"query": "{{searchTerm}}"}'
  saveTo: response
  saveStatus: statusCode
  throwOnError: "true"
```

| Proprietà | Descrizione |
|-----------|-------------|
| `url` | URL della richiesta (obbligatorio) |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE` |
| `contentType` | `json` (default), `form-data`, `text`, `binary` |
| `responseType` | `auto` (default), `text`, `binary`. Sovrascrivere il rilevamento automatico del Content-Type per la gestione della risposta |
| `headers` | Oggetto JSON o formato `Key: Value` (uno per riga) |
| `body` | Corpo della richiesta (per POST/PUT/PATCH) |
| `saveTo` | Variabile per il corpo della risposta |
| `saveStatus` | Variabile per il codice di stato HTTP |
| `throwOnError` | `true` per generare errore su risposte 4xx/5xx |

**Esempio form-data** (upload file binario con file-explorer):

```yaml
- id: select-pdf
  type: file-explorer
  path: "{{__eventFilePath__}}"
  extensions: "pdf,png,jpg"
  saveTo: fileData
- id: upload
  type: http
  url: "https://example.com/upload"
  method: POST
  contentType: form-data
  body: '{"file": "{{fileData}}"}'
  saveTo: response
```

Per `form-data`:
- FileExplorerData (dal nodo `file-explorer`) viene rilevato automaticamente e inviato come binario
- Usa la sintassi `fieldName:filename` per campi file di testo (es. `"file:report.html": "{{htmlContent}}"`)

### json

Analizza una stringa JSON in un oggetto per l'accesso alle proprieta.

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| Proprieta | Descrizione |
|-----------|-------------|
| `source` | Nome variabile contenente la stringa JSON (richiesto) |
| `saveTo` | Nome variabile per il risultato analizzato (richiesto) |

Dopo l'analisi, accedi alle proprieta usando la notazione punto: `{{data.items[0].name}}`

**JSON nei blocchi di codice markdown:**

Il nodo `json` estrae automaticamente JSON dai blocchi di codice markdown:

```yaml
# Se la risposta contiene:
# ```json
# {"status": "ok"}
# ```
# Il nodo json estrarra e analizzerà solo il contenuto JSON
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

Questo e utile quando una risposta LLM avvolge JSON in recinti di codice.

### dialog

Mostra una finestra di dialogo con opzioni, pulsanti e/o input di testo.

```yaml
- id: ask
  type: dialog
  title: Select Options
  message: Choose items to process
  markdown: true
  options: "Option A, Option B, Option C"
  multiSelect: true
  inputTitle: "Additional notes"
  multiline: true
  defaults: '{"input": "default text", "selected": ["Option A"]}'
  button1: Confirm
  button2: Cancel
  saveTo: dialogResult
```

| Proprietà | Descrizione |
|-----------|-------------|
| `title` | Titolo della finestra di dialogo |
| `message` | Contenuto del messaggio (supporta `{{variabili}}`) |
| `markdown` | `true` renderizza il messaggio come Markdown |
| `options` | Lista di scelte separate da virgola (opzionale) |
| `multiSelect` | `true` per checkbox, `false` per radio button |
| `inputTitle` | Etichetta per il campo di input testo (mostra input quando impostato) |
| `multiline` | `true` per area di testo multiriga |
| `defaults` | JSON con valori iniziali `input` e `selected` |
| `button1` | Etichetta pulsante primario (default: "OK") |
| `button2` | Etichetta pulsante secondario (opzionale) |
| `saveTo` | Variabile per il risultato (vedi sotto) |

**Formato del risultato** (variabile `saveTo`):
- `button`: string - testo del pulsante cliccato (es: "Conferma", "Annulla")
- `selected`: string[] - **sempre un array**, anche per selezione singola (es: `["Opzione A"]`)
- `input`: string - valore dell'input di testo (se `inputTitle` era impostato)

> **Importante:** Quando si verifica il valore selezionato in una condizione `if`:
> - Per opzione singola: `{{dialogResult.selected[0]}} == Opzione A`
> - Per verificare se l'array contiene un valore (multiSelect): `{{dialogResult.selected}} contains Opzione A`
> - Sbagliato: `{{dialogResult.selected}} == Opzione A` (confronta array con stringa, sempre false)

**Semplice input di testo:**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

Esegue un altro workflow come sub-workflow.

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| Proprietà | Descrizione |
|-----------|-------------|
| `path` | Percorso del file workflow (obbligatorio) |
| `name` | Nome del workflow (per file con workflow multipli) |
| `input` | Mappatura JSON delle variabili del sub-workflow ai valori |
| `output` | Mappatura JSON delle variabili padre ai risultati del sub-workflow |
| `prefix` | Prefisso per tutte le variabili di output (quando `output` non è specificato) |

### rag-sync

Sincronizza una nota con uno store RAG.

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| Proprietà | Descrizione |
|-----------|-------------|
| `path` | Percorso della nota da sincronizzare (obbligatorio, supporta `{{variabili}}`) |
| `ragSetting` | Nome dell'impostazione RAG (obbligatorio) |
| `saveTo` | Variabile per salvare il risultato (opzionale) |

**Formato output:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

Seleziona un file dal vault o inserisce un nuovo percorso file. Supporta qualsiasi tipo di file incluse immagini e PDF.

```yaml
- id: selectImage
  type: file-explorer
  mode: select
  title: "Select an image"
  extensions: "png,jpg,jpeg,gif,webp"
  default: "images/"
  saveTo: imageData
  savePathTo: imagePath
```

| Proprietà | Descrizione |
|-----------|-------------|
| `path` | Percorso file diretto - salta la finestra di dialogo quando impostato (supporta `{{variabili}}`) |
| `mode` | `select` (seleziona file esistente, default) o `create` (inserisci nuovo percorso) |
| `title` | Titolo della finestra di dialogo |
| `extensions` | Estensioni consentite separate da virgola (es. `pdf,png,jpg`) |
| `default` | Percorso predefinito (supporta `{{variabili}}`) |
| `saveTo` | Variabile per FileExplorerData JSON |
| `savePathTo` | Variabile per solo il percorso del file |

**Formato FileExplorerData:**
```json
{
  "path": "folder/image.png",
  "basename": "image.png",
  "name": "image",
  "extension": "png",
  "mimeType": "image/png",
  "contentType": "binary",
  "data": "base64-encoded-content"
}
```

**Esempio: Analisi Immagine (con finestra di dialogo)**
```yaml
- id: selectImage
  type: file-explorer
  title: "Select an image to analyze"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image in detail"
  attachments: imageData
  saveTo: analysis
- id: save
  type: note
  path: "analysis/{{imageData.name}}.md"
  content: "# Image Analysis\n\n{{analysis}}"
```

**Esempio: Attivato da evento (senza finestra di dialogo)**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: result
```

### file-save

Salva FileExplorerData come file nel vault. Utile per salvare immagini generate o file copiati.

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| Proprietà | Descrizione |
|-----------|-------------|
| `source` | Nome variabile contenente FileExplorerData (obbligatorio) |
| `path` | Percorso dove salvare il file (estensione aggiunta automaticamente se mancante) |
| `savePathTo` | Variabile per salvare il percorso file finale (opzionale) |

**Esempio: Generare e salvare immagine**
```yaml
- id: generate
  type: command
  prompt: "Generate a landscape image"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save
  type: file-save
  source: generatedImage
  path: "images/landscape"
  savePathTo: savedPath
- id: showResult
  type: dialog
  title: "Image Saved"
  message: "Image saved to {{savedPath}}"
```

### prompt-file

Mostra il selettore file o usa il file attivo in modalità hotkey/evento.

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| Proprietà | Descrizione |
|-----------|-------------|
| `title` | Titolo della finestra di dialogo |
| `default` | Percorso predefinito |
| `forcePrompt` | `true` mostra sempre la finestra di dialogo, anche in modalità hotkey/evento |
| `saveTo` | Variabile per il contenuto del file |
| `saveFileTo` | Variabile per le info file JSON |

**Formato info file:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**Comportamento per modalità di attivazione:**
| Modalità | Comportamento |
|----------|---------------|
| Pannello | Mostra finestra selettore file |
| Hotkey | Usa automaticamente il file attivo |
| Evento | Usa automaticamente il file dell'evento |

### prompt-selection

Ottiene il testo selezionato o mostra una finestra di selezione.

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| Proprietà | Descrizione |
|-----------|-------------|
| `saveTo` | Variabile per il testo selezionato |
| `saveSelectionTo` | Variabile per metadati selezione JSON |

**Formato info selezione:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**Comportamento per modalità di attivazione:**
| Modalità | Comportamento |
|----------|---------------|
| Pannello | Mostra finestra di selezione |
| Hotkey (con selezione) | Usa la selezione corrente |
| Hotkey (senza selezione) | Usa il contenuto completo del file |
| Evento | Usa il contenuto completo del file |

### if / while

Ramificazione condizionale e cicli.

```yaml
- id: branch
  type: if
  condition: "{{count}} > 10"
  trueNext: handleMany
  falseNext: handleFew

- id: loop
  type: while
  condition: "{{counter}} < {{total}}"
  trueNext: processItem
  falseNext: done
```

| Proprietà | Descrizione |
|-----------|-------------|
| `condition` | Espressione con operatori: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains` |
| `trueNext` | ID nodo quando la condizione è vera |
| `falseNext` | ID nodo quando la condizione è falsa |

**L'operatore `contains`** funziona sia con stringhe che con array:
- Stringa: `{{text}} contains error` - verifica se "error" è nella stringa
- Array: `{{dialogResult.selected}} contains Opzione A` - verifica se "Opzione A" è nell'array

> **Regola di riferimento all'indietro**: La proprietà `next` può fare riferimento a nodi precedenti solo se il target è un nodo `while`. Questo previene il codice spaghetti e garantisce una struttura di loop appropriata.

### variable / set

Dichiarano e aggiornano variabili.

```yaml
- id: init
  type: variable
  name: counter
  value: 0

- id: increment
  type: set
  name: counter
  value: "{{counter}} + 1"
```

**Variabile speciale `_clipboard`:**

Se imposti una variabile chiamata `_clipboard`, il suo valore verrà copiato negli appunti di sistema:

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

### mcp

Chiama un tool su un server MCP (Model Context Protocol) remoto via HTTP.

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| Proprietà | Descrizione |
|-----------|-------------|
| `url` | URL endpoint del server MCP (obbligatorio, supporta `{{variabili}}`) |
| `tool` | Nome del tool da chiamare sul server MCP (obbligatorio) |
| `args` | Oggetto JSON con argomenti del tool (supporta `{{variabili}}`) |
| `headers` | Oggetto JSON con header HTTP (es. per autenticazione) |
| `saveTo` | Nome variabile per il risultato |

**Caso d'uso:** Chiamare server MCP remoti per query RAG, ricerca web, integrazioni API, ecc.

### obsidian-command

Esegue un comando Obsidian tramite il suo ID. Questo permette ai workflow di attivare qualsiasi comando Obsidian, inclusi i comandi di altri plugin.

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| Proprieta | Descrizione |
|-----------|-------------|
| `command` | ID del comando da eseguire (obbligatorio, supporta `{{variabili}}`) |
| `path` | File da aprire prima di eseguire il comando (opzionale, la scheda rimane aperta) |
| `saveTo` | Variabile per memorizzare il risultato dell'esecuzione (opzionale) |

**Formato output** (quando `saveTo` e impostato):
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**Trovare gli ID dei comandi:**
1. Aprire Impostazioni Obsidian → Tasti di scelta rapida
2. Cercare il comando desiderato
3. L'ID del comando viene mostrato (es., `editor:toggle-fold`, `app:reload`)

**ID di comandi comuni:**
| ID Comando | Descrizione |
|------------|-------------|
| `editor:toggle-fold` | Attiva/disattiva piegatura al cursore |
| `editor:fold-all` | Piega tutti i titoli |
| `editor:unfold-all` | Espandi tutti i titoli |
| `app:reload` | Ricarica Obsidian |
| `workspace:close` | Chiudi pannello corrente |
| `file-explorer:reveal-active-file` | Rivela file nell'esploratore |

**Esempio: Workflow con comando plugin**
```yaml
name: Scrivi Log di Lavoro
nodes:
  - id: get-content
    type: dialog
    inputTitle: "Inserisci contenuto del log"
    multiline: true
    saveTo: logContent
  - id: copy-to-clipboard
    type: set
    name: "_clipboard"
    value: "{{logContent.input}}"
  - id: write-to-log
    type: obsidian-command
    command: "work-log:write-from-clipboard"
```

**Caso d'uso:** Attivare comandi core di Obsidian o comandi di altri plugin come parte di un workflow.

**Esempio: Crittografa tutti i file in una directory**

Questo workflow crittografa tutti i file Markdown in una cartella specificata usando il comando di crittografia di Gemini Helper:

```yaml
name: crittografa-cartella
nodes:
  - id: init-index
    type: variable
    name: index
    value: "0"
  - id: list-files
    type: note-list
    folder: "private"
    recursive: "true"
    saveTo: fileList
  - id: loop
    type: while
    condition: "{{index}} < {{fileList.count}}"
    trueNext: encrypt
    falseNext: done
  - id: encrypt
    type: obsidian-command
    command: "gemini-helper:encrypt-file"
    path: "{{fileList.notes[index].path}}"
  - id: wait
    type: sleep
    duration: "1000"
  - id: close-tab
    type: obsidian-command
    command: "workspace:close"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "Completato"
    message: "{{index}} file crittografati"
```

> **Nota:** Poiché il comando di crittografia viene eseguito in modo asincrono, viene utilizzato un nodo `sleep` per attendere il completamento dell'operazione prima di chiudere la scheda.

### sleep

Mette in pausa l'esecuzione del workflow per una durata specificata. Utile per attendere il completamento di operazioni asincrone.

```yaml
- id: wait
  type: sleep
  duration: "1000"
```

| Proprietà | Descrizione |
|-----------|-------------|
| `duration` | Durata della pausa in millisecondi (obbligatorio, supporta `{{variabili}}`) |

**Esempio:**
```yaml
- id: run-command
  type: obsidian-command
  command: "some-plugin:async-operation"
  path: "notes/file.md"
- id: wait-for-completion
  type: sleep
  duration: "2000"
- id: close
  type: obsidian-command
  command: "workspace:close"
```

---

**Esempio: Query RAG con ragujuary**

[ragujuary](https://github.com/takeshy/ragujuary) è uno strumento CLI per gestire Gemini File Search Stores con supporto server MCP.

1. Installazione e setup:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# Crea uno store e carica i file
ragujuary upload --create -s mystore ./docs

# Avvia il server MCP (usa --transport http, non sse)
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. Esempio di workflow:
```yaml
name: RAG Search
nodes:
  - id: query
    type: mcp
    url: "http://localhost:8080"
    tool: "query"
    args: '{"store_name": "mystore", "question": "How does authentication work?", "show_citations": true}'
    headers: '{"X-API-Key": "mysecretkey"}'
    saveTo: result
  - id: show
    type: dialog
    title: "Search Result"
    message: "{{result}}"
    markdown: true
    button1: "OK"
```

## Terminazione del Workflow

Usa `next: end` per terminare esplicitamente il workflow:

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # Il workflow termina qui

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # Termina il workflow sul ramo true
  falseNext: continue
```

## Espansione delle Variabili

Usa la sintassi `{{variabile}}` per fare riferimento alle variabili:

```yaml
# Base
path: "{{folder}}/{{filename}}.md"

# Accesso a oggetti/array
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# Variabili annidate (per cicli)
path: "{{parsed.notes[{{counter}}].path}}"
```

### Modificatore di Escape JSON

Usa `{{variable:json}}` per effettuare l'escape del valore per l'incorporamento in stringhe JSON. Questo effettua correttamente l'escape di newline, virgolette e altri caratteri speciali.

```yaml
# Senza :json - fallisce se il contenuto ha newline/virgolette
args: '{"text": "{{content}}"}'  # ERRORE se il contenuto ha caratteri speciali

# Con :json - sicuro per qualsiasi contenuto
args: '{"text": "{{content:json}}"}'  # OK - correttamente escapato
```

Questo è essenziale quando si passa il contenuto del file o l'input dell'utente a nodi `mcp` o `http` con corpi JSON.

## Nodi di Input Intelligenti

I nodi `prompt-selection` e `prompt-file` rilevano automaticamente il contesto di esecuzione:

| Nodo | Modalità Pannello | Modalità Hotkey | Modalità Evento |
|------|-------------------|-----------------|-----------------|
| `prompt-file` | Mostra selettore file | Usa file attivo | Usa file evento |
| `prompt-selection` | Mostra finestra selezione | Usa selezione o file completo | Usa contenuto file completo |

---

## Trigger di Eventi

I workflow possono essere attivati automaticamente dagli eventi di Obsidian.

![Impostazioni Trigger Eventi](event_setting.png)

### Eventi Disponibili

| Evento | Descrizione |
|--------|-------------|
| `create` | File creato |
| `modify` | File modificato/salvato (debounce 5s) |
| `delete` | File eliminato |
| `rename` | File rinominato |
| `file-open` | File aperto |

### Variabili di Evento

Quando attivato da un evento, queste variabili vengono impostate automaticamente:

| Variabile | Descrizione |
|-----------|-------------|
| `__eventType__` | Tipo di evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Percorso del file interessato |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | Contenuto del file (per eventi create/modify/file-open) |
| `__eventOldPath__` | Percorso precedente (solo per eventi rename) |

### Sintassi Pattern File

Filtra gli eventi per percorso file usando pattern glob:

| Pattern | Corrisponde a |
|---------|---------------|
| `**/*.md` | Tutti i file .md in qualsiasi cartella |
| `journal/*.md` | File .md direttamente nella cartella journal |
| `*.md` | File .md solo nella cartella radice |
| `**/{daily,weekly}/*.md` | File nelle cartelle daily o weekly |
| `projects/[a-z]*.md` | File che iniziano con lettera minuscola |
| `docs/**` | Tutti i file sotto la cartella docs |

### Esempio di Workflow Attivato da Evento

````markdown
```workflow
name: Auto-Tag New Notes
nodes:
  - id: getContent
    type: prompt-selection
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for this note:\n\n{{content}}"
    saveTo: tags
  - id: prepend
    type: note
    path: "{{__eventFilePath__}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**Setup:** Clicca su ⚡ nel pannello Workflow → abilita "File Created" → imposta pattern `**/*.md`

---

## Esempi Pratici

### 1. Riassunto Note

````markdown
```workflow
name: Note Summary
nodes:
  - id: select
    type: prompt-file
    title: Select note
    saveTo: content
    saveFileTo: fileInfo
  - id: parseFile
    type: json
    source: fileInfo
    saveTo: file
  - id: summarize
    type: command
    prompt: "Summarize this note:\n\n{{content}}"
    saveTo: summary
  - id: save
    type: note
    path: "summaries/{{file.name}}"
    content: "# Summary\n\n{{summary}}\n\n---\n*Source: {{file.path}}*"
    mode: create
```
````

### 2. Ricerca Web

````markdown
```workflow
name: Web Research
nodes:
  - id: topic
    type: dialog
    title: Research topic
    inputTitle: Topic
    saveTo: input
  - id: search
    type: command
    model: gemini-3-flash-preview
    ragSetting: __websearch__
    prompt: |
      Search the web for: {{input.input}}

      Include key facts, recent developments, and sources.
    saveTo: research
  - id: save
    type: note
    path: "research/{{input.input}}.md"
    content: "# {{input.input}}\n\n{{research}}"
    mode: overwrite
```
````

### 3. Elaborazione Condizionale

````markdown
```workflow
name: Smart Summarizer
nodes:
  - id: input
    type: dialog
    title: Enter text to process
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: branch
    type: if
    condition: "{{userInput.input.length}} > 500"
    trueNext: summarize
    falseNext: enhance
  - id: summarize
    type: command
    prompt: "Summarize this long text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: enhance
    type: command
    prompt: "Expand and enhance this short text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: save
    type: note
    path: "processed/output.md"
    content: "{{result}}"
    mode: overwrite
```
````

### 4. Elaborazione Batch di Note

````markdown
```workflow
name: Tag Analyzer
nodes:
  - id: init
    type: variable
    name: counter
    value: 0
  - id: initReport
    type: variable
    name: report
    value: "# Tag Suggestions\n\n"
  - id: list
    type: note-list
    folder: Clippings
    limit: 5
    saveTo: notes
  - id: json
    type: json
    source: notes
    saveTo: parsed
  - id: loop
    type: while
    condition: "{{counter}} < {{parsed.count}}"
    trueNext: read
    falseNext: finish
  - id: read
    type: note-read
    path: "{{parsed.notes[{{counter}}].path}}"
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for:\n\n{{content}}"
    saveTo: tags
  - id: append
    type: set
    name: report
    value: "{{report}}## {{parsed.notes[{{counter}}].name}}\n{{tags}}\n\n"
  - id: increment
    type: set
    name: counter
    value: "{{counter}} + 1"
    next: loop
  - id: finish
    type: note
    path: "reports/tag-suggestions.md"
    content: "{{report}}"
    mode: overwrite
```
````

### 5. Integrazione API

````markdown
```workflow
name: Weather Report
nodes:
  - id: city
    type: dialog
    title: City name
    inputTitle: City
    saveTo: cityInput
  - id: geocode
    type: http
    url: "https://geocoding-api.open-meteo.com/v1/search?name={{cityInput.input}}&count=1"
    method: GET
    saveTo: geoResponse
  - id: parseGeo
    type: json
    source: geoResponse
    saveTo: geo
  - id: weather
    type: http
    url: "https://api.open-meteo.com/v1/forecast?latitude={{geo.results[0].latitude}}&longitude={{geo.results[0].longitude}}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto"
    method: GET
    saveTo: weatherData
  - id: parse
    type: json
    source: weatherData
    saveTo: data
  - id: report
    type: command
    prompt: "Create a weather report:\n{{data}}"
    saveTo: summary
  - id: save
    type: note
    path: "weather/{{cityInput.input}}.md"
    content: "# Weather: {{cityInput.input}}\n\n{{summary}}"
    mode: overwrite
```
````

### 6. Traduci Selezione (con Hotkey)

````markdown
```workflow
name: Translate Selection
nodes:
  - id: getSelection
    type: prompt-selection
    saveTo: text
  - id: translate
    type: command
    prompt: "Translate the following text to English:\n\n{{text}}"
    saveTo: translated
  - id: output
    type: note
    path: "translations/translated.md"
    content: "## Original\n{{text}}\n\n## Translation\n{{translated}}\n\n---\n"
    mode: append
  - id: show
    type: open
    path: "translations/translated.md"
```
````

**Configurazione hotkey:**
1. Aggiungi un campo `name:` al tuo workflow
2. Apri il file del workflow e seleziona il workflow dal menu a tendina
3. Clicca l'icona tastiera nel footer del pannello Workflow
4. Vai in Impostazioni → Tasti di scelta rapida → cerca "Workflow: Translate Selection"
5. Assegna un tasto di scelta rapida (es. `Ctrl+Shift+T`)

### 7. Composizione Sub-Workflow

**File: `workflows/translate.md`**
````markdown
```workflow
name: Translator
nodes:
  - id: translate
    type: command
    prompt: "Translate to {{targetLang}}:\n\n{{text}}"
    saveTo: translated
```
````

**File: `workflows/main.md`**
````markdown
```workflow
name: Multi-Language Export
nodes:
  - id: input
    type: dialog
    title: Enter text to translate
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: toJapanese
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Japanese"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Spanish"}'
    output: '{"spanishText": "translated"}'
  - id: save
    type: note
    path: "translations/output.md"
    content: |
      # Original
      {{userInput.input}}

      ## Japanese
      {{japaneseText}}

      ## Spanish
      {{spanishText}}
    mode: overwrite
```
````

### 8. Selezione Attività Interattiva

````markdown
```workflow
name: Task Processor
nodes:
  - id: selectTasks
    type: dialog
    title: Select Tasks
    message: Choose which tasks to perform on the current note
    options: "Summarize, Extract key points, Translate to English, Fix grammar"
    multiSelect: true
    button1: Process
    button2: Cancel
    saveTo: selection
  - id: checkCancel
    type: if
    condition: "{{selection.button}} == 'Cancel'"
    trueNext: cancelled
    falseNext: getFile
  - id: getFile
    type: prompt-file
    saveTo: content
  - id: process
    type: command
    prompt: |
      Perform the following tasks on this text:
      Tasks: {{selection.selected}}

      Text:
      {{content}}
    saveTo: result
  - id: save
    type: note
    path: "processed/result.md"
    content: "{{result}}"
    mode: create
    next: end
  - id: cancelled
    type: dialog
    title: Cancelled
    message: Operation was cancelled by user.
    button1: OK
    next: end
```
````
