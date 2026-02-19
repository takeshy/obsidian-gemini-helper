# Workflow-Knotenreferenz

Dieses Dokument bietet detaillierte Spezifikationen fuer alle Workflow-Knotentypen. Fuer die meisten Benutzer gilt: **Sie muessen diese Details nicht lernen** - beschreiben Sie einfach in natuerlicher Sprache, was Sie moechten, und die KI erstellt oder modifiziert Workflows fuer Sie.

## Knotentypen-Uebersicht

| Kategorie | Knoten | Beschreibung |
|-----------|--------|--------------|
| Variablen | `variable`, `set` | Variablen deklarieren und aktualisieren |
| Steuerung | `if`, `while` | Bedingte Verzweigungen und Schleifen |
| LLM | `command` | Prompts mit Modell-/Suchoptionen ausfuehren |
| Daten | `http`, `json` | HTTP-Anfragen und JSON-Parsing |
| Notizen | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Vault-Operationen |
| Dateien | `file-explorer`, `file-save` | Dateiauswahl und Speichern (Bilder, PDFs usw.) |
| Eingaben | `prompt-file`, `prompt-selection`, `dialog` | Benutzereingabe-Dialoge |
| Komposition | `workflow` | Einen anderen Workflow als Sub-Workflow ausfuehren |
| RAG | `rag-sync` | Notizen mit RAG-Store synchronisieren |
| Extern | `mcp`, `obsidian-command` | Externe MCP-Server oder Obsidian-Befehle aufrufen |
| Dienstprogramm | `sleep` | Workflow-Ausfuehrung pausieren |

---

## Workflow-Optionen

Sie koennen einen `options`-Abschnitt hinzufuegen, um das Workflow-Verhalten zu steuern:

```yaml
name: My Workflow
options:
  showProgress: false  # Ausfuehrungsfortschritts-Modal ausblenden (Standard: true)
nodes:
  - id: step1
    type: command
    ...
```

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `showProgress` | boolean | `true` | Fortschritts-Modal bei Ausfuehrung ueber Hotkey oder Workflow-Liste anzeigen |

**Hinweis:** Die Option `showProgress` wirkt sich nur auf die Ausfuehrung ueber Hotkey oder Workflow-Liste aus. Das visuelle Workflow-Panel zeigt immer den Fortschritt an.

---

## Knotenreferenz

### command

Fuehrt einen LLM-Prompt mit optionalen Modell-, Such-, Vault-Tools- und MCP-Einstellungen aus.

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # Optional: spezifisches Modell
  ragSetting: __websearch__      # Optional: __websearch__, __none__ oder Name der Einstellung
  vaultTools: all                # Optional: all, noSearch, none
  mcpServers: "server1,server2"  # Optional: kommagetrennte MCP-Servernamen
  prompt: "Search for {{topic}}"
  saveTo: result
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `prompt` | Der an das LLM zu sendende Prompt (erforderlich) |
| `model` | Ueberschreibt das aktuelle Modell (verfuegbare Modelle haengen von der API-Plan-Einstellung ab) |
| `ragSetting` | `__websearch__` (Websuche), `__none__` (keine Suche), RAG-Einstellungsname oder weglassen fuer aktuelles |
| `vaultTools` | Vault-Tools-Modus: `all` (Suche + Lesen/Schreiben), `noSearch` (nur Lesen/Schreiben), `none` (deaktiviert). Standard: `all` |
| `mcpServers` | Kommagetrennte MCP-Servernamen zum Aktivieren (muessen in den Plugin-Einstellungen konfiguriert sein) |
| `attachments` | Kommagetrennte Variablennamen mit FileExplorerData (vom `file-explorer`-Knoten) |
| `saveTo` | Variablenname zum Speichern der Textantwort |
| `saveImageTo` | Variablenname zum Speichern des generierten Bildes (FileExplorerData-Format, fuer Bildmodelle) |

**Beispiel fuer Bildgenerierung**:
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

**CLI-Modelle:**

Sie koennen CLI-Modelle (`gemini-cli`, `claude-cli`, `codex-cli`) in Workflows verwenden, wenn die CLI in den Plugin-Einstellungen konfiguriert ist. CLI-Modelle sind nuetzlich, um auf Flagship-Modelle ohne API-Kosten zuzugreifen.

```yaml
- id: analyze
  type: command
  model: claude-cli
  prompt: "Analysiere diesen Code:\n\n{{code}}"
  saveTo: analysis
```

> **Hinweis:** CLI-Modelle unterstuetzen kein RAG, keine Websuche und keine Bildgenerierung. Die Eigenschaften `ragSetting` und `saveImageTo` werden bei CLI-Modellen ignoriert.

### note

Schreibt Inhalt in eine Notizdatei.

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `path` | Dateipfad (erforderlich) |
| `content` | Zu schreibender Inhalt |
| `mode` | `overwrite` (Standard), `append` oder `create` (ueberspringen, falls vorhanden) |
| `confirm` | `true` (Standard) zeigt Bestaetigungsdialog, `false` schreibt sofort |
| `history` | `true` (Standard, folgt globaler Einstellung) speichert im Bearbeitungsverlauf, `false` deaktiviert Verlauf fuer dieses Schreiben |

### note-read

Liest Inhalt aus einer Notizdatei.

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `path` | Zu lesender Dateipfad (erforderlich) |
| `saveTo` | Variablenname zum Speichern des Dateiinhalts (erforderlich) |

**Unterstuetzung verschluesselter Dateien:**

Wenn die Zieldatei verschluesselt ist (ueber die Verschluesselungsfunktion des Plugins), wird der Workflow automatisch:
1. Pruefen, ob das Passwort bereits in der aktuellen Sitzung zwischengespeichert ist
2. Falls nicht zwischengespeichert, den Benutzer zur Passworteingabe auffordern
3. Den Dateiinhalt entschluesseln und in der Variable speichern
4. Das Passwort fuer nachfolgende Lesevorgaenge zwischenspeichern (innerhalb derselben Obsidian-Sitzung)

Sobald Sie das Passwort einmal eingegeben haben, muessen Sie es nicht erneut eingeben, um andere verschluesselte Dateien zu lesen, bis Sie Obsidian neu starten.

**Beispiel: API-Schluessel aus verschluesselter Datei lesen und externe API aufrufen**

Dieser Workflow liest einen API-Schluessel aus einer verschluesselten Datei, ruft eine externe API auf und zeigt das Ergebnis an:

```yaml
name: API mit verschluesseltem Schluessel aufrufen
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
    title: API-Antwort
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **Tipp:** Speichern Sie sensible Daten wie API-Schluessel in verschluesselten Dateien. Verwenden Sie den Befehl "Datei verschluesseln" aus der Befehlspalette, um eine Datei mit Ihren Geheimnissen zu verschluesseln.

### note-list

Listet Notizen mit Filter- und Sortieroptionen auf.

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

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `folder` | Ordnerpfad (leer fuer gesamten Vault) |
| `recursive` | `true` schliesst Unterordner ein, `false` (Standard) nur direkte Unterelemente |
| `tags` | Kommagetrennte Tags zum Filtern (mit oder ohne `#`) |
| `tagMatch` | `any` (Standard) oder `all` Tags muessen uebereinstimmen |
| `createdWithin` | Nach Erstellungszeit filtern: `30m`, `24h`, `7d` |
| `modifiedWithin` | Nach Aenderungszeit filtern |
| `sortBy` | `created`, `modified` oder `name` |
| `sortOrder` | `asc` oder `desc` (Standard) |
| `limit` | Maximale Ergebnisse (Standard: 50) |
| `saveTo` | Variable fuer Ergebnisse |

**Ausgabeformat:**
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

Sucht nach Notizen nach Name oder Inhalt.

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `query` | Suchabfragezeichenfolge (erforderlich, unterstuetzt `{{variables}}`) |
| `searchContent` | `true` durchsucht Dateiinhalte, `false` (Standard) durchsucht nur Dateinamen |
| `limit` | Maximale Ergebnisse (Standard: 10) |
| `saveTo` | Variable fuer Ergebnisse (erforderlich) |

**Ausgabeformat:**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...Kontext um Treffer..."}
  ]
}
```

Wenn `searchContent` `true` ist, enthaelt `matchedContent` etwa 50 Zeichen vor und nach dem Treffer als Kontext.

### folder-list

Listet Ordner im Vault auf.

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `folder` | Uebergeordneter Ordnerpfad (leer fuer gesamten Vault) |
| `saveTo` | Variable fuer Ergebnisse (erforderlich) |

**Ausgabeformat:**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

Ordner werden alphabetisch sortiert.

### open

Oeffnet eine Datei in Obsidian.

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `path` | Dateipfad zum Oeffnen (erforderlich, unterstuetzt `{{variables}}`) |

Wenn der Pfad keine `.md`-Erweiterung hat, wird sie automatisch hinzugefuegt.

### http

Fuehrt HTTP-Anfragen aus.

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

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `url` | Anfrage-URL (erforderlich) |
| `method` | `GET` (Standard), `POST`, `PUT`, `PATCH`, `DELETE` |
| `contentType` | `json` (Standard), `form-data`, `text`, `binary` |
| `responseType` | `auto` (Standard), `text`, `binary`. Content-Type-Autoerkennung für die Antwortverarbeitung überschreiben |
| `headers` | JSON-Objekt oder `Key: Value`-Format (eines pro Zeile) |
| `body` | Anfrage-Body (fuer POST/PUT/PATCH) |
| `saveTo` | Variable fuer Antwort-Body |
| `saveStatus` | Variable fuer HTTP-Statuscode |
| `throwOnError` | `true` wirft Fehler bei 4xx/5xx-Antworten |

**form-data-Beispiel** (Binaer-Datei-Upload mit file-explorer):

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

Fuer `form-data`:
- FileExplorerData (vom `file-explorer`-Knoten) wird automatisch erkannt und als Binaer gesendet
- Verwenden Sie die `fieldName:filename`-Syntax fuer Textdateifelder (z.B. `"file:report.html": "{{htmlContent}}"`)

### json

Parst einen JSON-String in ein Objekt fuer Eigenschaftszugriff.

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `source` | Variablenname mit JSON-String (erforderlich) |
| `saveTo` | Variablenname fuer geparsten Ergebnis (erforderlich) |

Nach dem Parsen koennen Sie auf Eigenschaften mit Punktnotation zugreifen: `{{data.items[0].name}}`

**JSON in Markdown-Codebloecken:**

Der `json`-Knoten extrahiert JSON automatisch aus Markdown-Codebloecken:

```yaml
# Wenn die Antwort enthaelt:
# ```json
# {"status": "ok"}
# ```
# Extrahiert und parst der json-Knoten nur den JSON-Inhalt
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

Dies ist nuetzlich, wenn eine LLM-Antwort JSON in Code-Zaeunen einschliesst.

### dialog

Zeigt einen Dialog mit Optionen, Schaltflaechen und/oder Texteingabe an.

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

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `title` | Dialogtitel |
| `message` | Nachrichteninhalt (unterstuetzt `{{variables}}`) |
| `markdown` | `true` rendert Nachricht als Markdown |
| `options` | Kommagetrennte Liste von Auswahlmoeglichkeiten (optional) |
| `multiSelect` | `true` fuer Checkboxen, `false` fuer Radiobuttons |
| `inputTitle` | Beschriftung fuer Texteingabefeld (zeigt Eingabe an, wenn gesetzt) |
| `multiline` | `true` fuer mehrzeiliges Textfeld |
| `defaults` | JSON mit `input` und `selected` Initialwerten |
| `button1` | Primaere Schaltflaechen-Beschriftung (Standard: "OK") |
| `button2` | Sekundaere Schaltflaechen-Beschriftung (optional) |
| `saveTo` | Variable fuer Ergebnis (siehe unten) |

**Ergebnisformat** (`saveTo`-Variable):
- `button`: string - Text der geklickten Schaltflaeche (z.B. "Bestaetigen", "Abbrechen")
- `selected`: string[] - **immer ein Array**, auch bei Einzelauswahl (z.B. `["Option A"]`)
- `input`: string - Texteingabewert (wenn `inputTitle` gesetzt war)

> **Wichtig:** Beim Pruefen des ausgewaehlten Wertes in einer `if`-Bedingung:
> - Fuer einzelne Option: `{{dialogResult.selected[0]}} == Option A`
> - Zum Pruefen, ob Array einen Wert enthaelt (multiSelect): `{{dialogResult.selected}} contains Option A`
> - Falsch: `{{dialogResult.selected}} == Option A` (vergleicht Array mit String, immer false)

**Einfache Texteingabe:**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

Fuehrt einen anderen Workflow als Sub-Workflow aus.

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `path` | Pfad zur Workflow-Datei (erforderlich) |
| `name` | Workflow-Name (fuer Dateien mit mehreren Workflows) |
| `input` | JSON-Mapping von Sub-Workflow-Variablen auf Werte |
| `output` | JSON-Mapping von Eltern-Variablen auf Sub-Workflow-Ergebnisse |
| `prefix` | Praefix fuer alle Ausgabevariablen (wenn `output` nicht angegeben) |

### rag-sync

Synchronisiert eine Notiz mit einem RAG-Store.

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `path` | Notizpfad zum Synchronisieren (erforderlich, unterstuetzt `{{variables}}`) |
| `ragSetting` | RAG-Einstellungsname (erforderlich) |
| `saveTo` | Variable zum Speichern des Ergebnisses (optional) |

**Ausgabeformat:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

Waehlt eine Datei aus dem Vault aus oder gibt einen neuen Dateipfad ein. Unterstuetzt jeden Dateityp einschliesslich Bilder und PDFs.

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

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `path` | Direkter Dateipfad - ueberspringt Dialog, wenn gesetzt (unterstuetzt `{{variables}}`) |
| `mode` | `select` (vorhandene Datei auswaehlen, Standard) oder `create` (neuen Pfad eingeben) |
| `title` | Dialogtitel |
| `extensions` | Kommagetrennte erlaubte Erweiterungen (z.B. `pdf,png,jpg`) |
| `default` | Standardpfad (unterstuetzt `{{variables}}`) |
| `saveTo` | Variable fuer FileExplorerData JSON |
| `savePathTo` | Variable nur fuer den Dateipfad |

**FileExplorerData-Format:**
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

**Beispiel: Bildanalyse (mit Dialog)**
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

**Beispiel: Ereignisgesteuert (ohne Dialog)**
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

Speichert FileExplorerData als Datei im Vault. Nuetzlich zum Speichern generierter Bilder oder kopierter Dateien.

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `source` | Variablenname mit FileExplorerData (erforderlich) |
| `path` | Pfad zum Speichern der Datei (Erweiterung wird automatisch hinzugefuegt, falls fehlend) |
| `savePathTo` | Variable zum Speichern des endgueltigen Dateipfads (optional) |

**Beispiel: Bild generieren und speichern**
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

Zeigt Dateiauswahl an oder verwendet aktive Datei im Hotkey-/Ereignismodus.

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `title` | Dialogtitel |
| `default` | Standardpfad |
| `forcePrompt` | `true` zeigt immer Dialog an, auch im Hotkey-/Ereignismodus |
| `saveTo` | Variable fuer Dateiinhalt |
| `saveFileTo` | Variable fuer Dateiinfo JSON |

**Dateiinfo-Format:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**Verhalten nach Ausloeser-Modus:**
| Modus | Verhalten |
|-------|-----------|
| Panel | Zeigt Dateiauswahl-Dialog |
| Hotkey | Verwendet automatisch aktive Datei |
| Ereignis | Verwendet automatisch Ereignisdatei |

### prompt-selection

Holt markierten Text oder zeigt Auswahl-Dialog an.

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `saveTo` | Variable fuer markierten Text |
| `saveSelectionTo` | Variable fuer Auswahl-Metadaten JSON |

**Auswahlinfo-Format:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**Verhalten nach Ausloeser-Modus:**
| Modus | Verhalten |
|-------|-----------|
| Panel | Zeigt Auswahl-Dialog |
| Hotkey (mit Auswahl) | Verwendet aktuelle Auswahl |
| Hotkey (ohne Auswahl) | Verwendet gesamten Dateiinhalt |
| Ereignis | Verwendet gesamten Dateiinhalt |

### if / while

Bedingte Verzweigungen und Schleifen.

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

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `condition` | Ausdruck mit Operatoren: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains` |
| `trueNext` | Knoten-ID wenn Bedingung wahr ist |
| `falseNext` | Knoten-ID wenn Bedingung falsch ist |

**Der `contains`-Operator** funktioniert sowohl mit Strings als auch mit Arrays:
- String: `{{text}} contains error` - prueft, ob "error" im String enthalten ist
- Array: `{{dialogResult.selected}} contains Option A` - prueft, ob "Option A" im Array enthalten ist

> **Rückwärtsreferenz-Regel**: Die `next`-Eigenschaft kann nur auf frühere Knoten verweisen, wenn das Ziel ein `while`-Knoten ist. Dies verhindert Spaghetti-Code und gewährleistet eine ordnungsgemäße Schleifenstruktur.

### variable / set

Variablen deklarieren und aktualisieren.

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

**Spezielle Variable `_clipboard`:**

Wenn Sie eine Variable namens `_clipboard` setzen, wird ihr Wert in die System-Zwischenablage kopiert:

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

### mcp

Ruft ein entferntes MCP (Model Context Protocol) Server-Tool ueber HTTP auf.

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `url` | MCP-Server-Endpunkt-URL (erforderlich, unterstuetzt `{{variables}}`) |
| `tool` | Name des aufzurufenden Tools auf dem MCP-Server (erforderlich) |
| `args` | JSON-Objekt mit Tool-Argumenten (unterstuetzt `{{variables}}`) |
| `headers` | JSON-Objekt mit HTTP-Headern (z.B. fuer Authentifizierung) |
| `saveTo` | Variablenname fuer das Ergebnis |

**Anwendungsfall:** Ruft entfernte MCP-Server fuer RAG-Abfragen, Websuche, API-Integrationen usw. auf.

### obsidian-command

Fuehrt einen Obsidian-Befehl ueber seine ID aus. Dies ermoeglicht es Workflows, jeden Obsidian-Befehl auszuloesen, einschliesslich Befehle von anderen Plugins.

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `command` | Auszufuehrende Befehls-ID (erforderlich, unterstuetzt `{{variables}}`) |
| `path` | Datei, die vor der Befehlsausführung geöffnet wird (optional, Tab bleibt geöffnet) |
| `saveTo` | Variable zum Speichern des Ausfuehrungsergebnisses (optional) |

**Ausgabeformat** (wenn `saveTo` gesetzt ist):
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**Befehls-IDs finden:**
1. Obsidian-Einstellungen → Tastenkuerzel oeffnen
2. Nach dem gewuenschten Befehl suchen
3. Die Befehls-ID wird angezeigt (z.B. `editor:toggle-fold`, `app:reload`)

**Haeufige Befehls-IDs:**
| Befehls-ID | Beschreibung |
|------------|--------------|
| `editor:toggle-fold` | Faltung am Cursor umschalten |
| `editor:fold-all` | Alle Ueberschriften falten |
| `editor:unfold-all` | Alle Ueberschriften entfalten |
| `app:reload` | Obsidian neu laden |
| `workspace:close` | Aktuelles Panel schliessen |
| `file-explorer:reveal-active-file` | Datei im Explorer anzeigen |

**Beispiel: Workflow mit Plugin-Befehl**
```yaml
name: Arbeitsprotokoll Schreiben
nodes:
  - id: get-content
    type: dialog
    inputTitle: "Protokollinhalt eingeben"
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

**Anwendungsfall:** Obsidian-Kernbefehle oder Befehle von anderen Plugins als Teil eines Workflows ausloesen.

**Beispiel: Alle Dateien in einem Verzeichnis verschlüsseln**

Dieser Workflow verschlüsselt alle Markdown-Dateien in einem angegebenen Ordner mit dem Verschlüsselungsbefehl von Gemini Helper:

```yaml
name: Ordner verschlüsseln
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
    title: "Fertig"
    message: "{{index}} Dateien wurden verschlüsselt"
```

> **Hinweis:** Da der Verschlüsselungsbefehl asynchron ausgeführt wird, wird ein `sleep`-Knoten verwendet, um auf den Abschluss des Vorgangs zu warten, bevor der Tab geschlossen wird.

### sleep

Pausiert die Workflow-Ausführung für eine bestimmte Dauer. Nützlich zum Warten auf den Abschluss asynchroner Operationen.

```yaml
- id: wait
  type: sleep
  duration: "1000"
```

| Eigenschaft | Beschreibung |
|-------------|--------------|
| `duration` | Schlafzeit in Millisekunden (erforderlich, unterstützt `{{variables}}`) |

**Beispiel:**
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

**Beispiel: RAG-Abfrage mit ragujuary**

[ragujuary](https://github.com/takeshy/ragujuary) ist ein CLI-Tool zur Verwaltung von Gemini File Search Stores mit MCP-Server-Unterstuetzung.

1. Installation und Einrichtung:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# Store erstellen und Dateien hochladen
ragujuary upload --create -s mystore ./docs

# MCP-Server starten (verwenden Sie --transport http, nicht sse)
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. Workflow-Beispiel:
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

## Workflow-Beendigung

Verwenden Sie `next: end`, um den Workflow explizit zu beenden:

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # Workflow endet hier

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # Workflow bei true-Zweig beenden
  falseNext: continue
```

## Variablenexpansion

Verwenden Sie die `{{variable}}`-Syntax, um auf Variablen zu verweisen:

```yaml
# Einfach
path: "{{folder}}/{{filename}}.md"

# Objekt-/Array-Zugriff
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# Verschachtelte Variablen (fuer Schleifen)
path: "{{parsed.notes[{{counter}}].path}}"
```

### JSON-Escape-Modifikator

Verwenden Sie `{{variable:json}}`, um den Wert fuer die Einbettung in JSON-Strings zu escapen. Dies escapt korrekt Zeilenumbrueche, Anfuehrungszeichen und andere Sonderzeichen.

```yaml
# Ohne :json - schlaegt fehl, wenn der Inhalt Zeilenumbrueche/Anfuehrungszeichen hat
args: '{"text": "{{content}}"}'  # FEHLER wenn der Inhalt Sonderzeichen hat

# Mit :json - sicher fuer jeden Inhalt
args: '{"text": "{{content:json}}"}'  # OK - korrekt escapt
```

Dies ist essentiell, wenn Dateiinhalt oder Benutzereingaben an `mcp`- oder `http`-Knoten mit JSON-Body uebergeben werden.

## Intelligente Eingabeknoten

Die Knoten `prompt-selection` und `prompt-file` erkennen automatisch den Ausfuehrungskontext:

| Knoten | Panel-Modus | Hotkey-Modus | Ereignis-Modus |
|--------|-------------|--------------|----------------|
| `prompt-file` | Zeigt Dateiauswahl | Verwendet aktive Datei | Verwendet Ereignisdatei |
| `prompt-selection` | Zeigt Auswahl-Dialog | Verwendet Auswahl oder gesamte Datei | Verwendet gesamten Dateiinhalt |

---

## Ereignis-Ausloeser

Workflows koennen automatisch durch Obsidian-Ereignisse ausgeloest werden.

![Ereignis-Ausloeser-Einstellungen](event_setting.png)

### Verfuegbare Ereignisse

| Ereignis | Beschreibung |
|----------|--------------|
| `create` | Datei erstellt |
| `modify` | Datei geaendert/gespeichert (5s entprellt) |
| `delete` | Datei geloescht |
| `rename` | Datei umbenannt |
| `file-open` | Datei geoeffnet |

### Ereignis-Variablen

Bei Ausloesung durch ein Ereignis werden diese Variablen automatisch gesetzt:

| Variable | Beschreibung |
|----------|--------------|
| `__eventType__` | Ereignistyp: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Pfad der betroffenen Datei |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | Dateiinhalt (fuer create/modify/file-open-Ereignisse) |
| `__eventOldPath__` | Vorheriger Pfad (nur fuer rename-Ereignisse) |

### Dateimuster-Syntax

Filtern Sie Ereignisse nach Dateipfad mit Glob-Mustern:

| Muster | Trifft zu auf |
|--------|---------------|
| `**/*.md` | Alle .md-Dateien in jedem Ordner |
| `journal/*.md` | .md-Dateien direkt im journal-Ordner |
| `*.md` | .md-Dateien nur im Stammordner |
| `**/{daily,weekly}/*.md` | Dateien in daily- oder weekly-Ordnern |
| `projects/[a-z]*.md` | Dateien, die mit Kleinbuchstaben beginnen |
| `docs/**` | Alle Dateien unter dem docs-Ordner |

### Beispiel fuer ereignisgesteuerten Workflow

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

**Einrichtung:** Klicken Sie auf das Blitz-Symbol im Workflow-Panel -> aktivieren Sie "File Created" -> setzen Sie das Muster auf `**/*.md`

---

## Praktische Beispiele

### 1. Notiz-Zusammenfassung

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

### 2. Web-Recherche

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

### 3. Bedingte Verarbeitung

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

### 4. Stapelverarbeitung von Notizen

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

### 5. API-Integration

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

### 6. Auswahl uebersetzen (mit Hotkey)

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

**Hotkey-Einrichtung:**
1. Fuegen Sie ein `name:`-Feld zu Ihrem Workflow hinzu
2. Oeffnen Sie die Workflow-Datei und waehlen Sie den Workflow aus dem Dropdown
3. Klicken Sie auf das Tastatur-Symbol in der Workflow-Panel-Fusszeile
4. Gehen Sie zu Einstellungen -> Tastenkuerzel -> suchen Sie "Workflow: Translate Selection"
5. Weisen Sie ein Tastenkuerzel zu (z.B. `Strg+Umschalt+T`)

### 7. Sub-Workflow-Komposition

**Datei: `workflows/translate.md`**
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

**Datei: `workflows/main.md`**
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

### 8. Interaktive Aufgabenauswahl

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
