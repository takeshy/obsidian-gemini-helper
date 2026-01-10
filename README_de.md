# Gemini Helper für Obsidian

**Kostenloser und quelloffener** KI-Assistent für Obsidian mit **Chat**, **Workflow-Automatisierung** und **RAG**, unterstützt von Google Gemini.

> **Dieses Plugin ist vollständig kostenlos.** Sie benötigen lediglich einen Google Gemini API-Schlüssel (kostenlos oder kostenpflichtig) von [ai.google.dev](https://ai.google.dev), oder nutzen Sie CLI-Tools: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code) oder [Codex CLI](https://github.com/openai/codex).

## Highlights

- **KI-Chat** - Streaming-Antworten, Dateianhänge, Vault-Operationen, Slash-Befehle
- **Workflow Builder** - Automatisieren Sie mehrstufige Aufgaben mit visuellem Node-Editor und 22 Node-Typen
- **Bearbeitungsverlauf** - Verfolgen und Wiederherstellen von KI-Änderungen mit Diff-Ansicht
- **RAG** - Retrieval-Augmented Generation für intelligente Suche in Ihrem Vault
- **Websuche** - Zugriff auf aktuelle Informationen über Google Search
- **Bilderzeugung** - Erstellen Sie Bilder mit Gemini-Bildmodellen

## API-Schlüssel / CLI-Optionen

Dieses Plugin benötigt einen Google Gemini API-Schlüssel oder ein CLI-Tool. Sie können wählen zwischen:

| Funktion | Kostenloser API-Schlüssel | Kostenpflichtiger API-Schlüssel | CLI |
|----------|---------------------------|--------------------------------|-----|
| Einfacher Chat | ✅ | ✅ | ✅ |
| Vault-Operationen | ✅ | ✅ | Nur Lesen/Suchen |
| Websuche | ✅ | ✅ | ❌ |
| RAG | ✅ (eingeschränkt) | ✅ | ❌ |
| Workflow | ✅ | ✅ | ✅ |
| Bilderzeugung | ❌ | ✅ | ❌ |
| Modelle | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| Kosten | **Kostenlos** | Nutzungsbasiert | **Kostenlos** |

> [!TIP]
> **CLI-Optionen** ermöglichen die Nutzung von Flaggschiff-Modellen nur mit einem Konto - kein API-Schlüssel erforderlich!
> - **Gemini CLI**: Installieren Sie [Gemini CLI](https://github.com/google-gemini/gemini-cli), führen Sie `gemini` aus und authentifizieren Sie sich mit `/auth`
> - **Claude CLI**: Installieren Sie [Claude Code](https://github.com/anthropics/claude-code) (`npm install -g @anthropic-ai/claude-code`), führen Sie `claude` aus und authentifizieren Sie sich
> - **Codex CLI**: Installieren Sie [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`), führen Sie `codex` aus und authentifizieren Sie sich

### Tipps für den kostenlosen API-Schlüssel

- **Rate-Limits** gelten pro Modell und werden täglich zurückgesetzt. Wechseln Sie das Modell, um weiterzuarbeiten.
- **RAG-Sync** ist eingeschränkt. Führen Sie "Sync Vault" täglich aus - bereits hochgeladene Dateien werden übersprungen.
- **Gemma-Modelle** und **Gemini CLI** unterstützen keine Vault-Operationen im Chat, aber **Workflows können weiterhin Notizen lesen/schreiben** mit `note`, `note-read` und anderen Node-Typen. Die Variablen `{content}` und `{selection}` funktionieren ebenfalls.

---

# KI-Chat

Die KI-Chat-Funktion bietet eine interaktive Konversationsschnittstelle mit Google Gemini, integriert in Ihren Obsidian-Vault.

![Chat-Oberfläche](chat.png)

## Slash-Befehle

Erstellen Sie wiederverwendbare Prompt-Vorlagen, die mit `/` ausgelöst werden:

- Definieren Sie Vorlagen mit `{selection}` (ausgewählter Text) und `{content}` (aktive Notiz)
- Optionale Modell- und Suchüberschreibung pro Befehl
- Tippen Sie `/`, um verfügbare Befehle anzuzeigen

**Standard:** `/infographic` - Konvertiert Inhalte in HTML-Infografiken

![Infografik-Beispiel](chat_infographic.png)

## @-Erwähnungen

Referenzieren Sie Dateien und Variablen durch Eingabe von `@`:

- `{selection}` - Ausgewählter Text
- `{content}` - Inhalt der aktiven Notiz
- Jede Vault-Datei - Durchsuchen und einfügen (nur Pfad; KI liest Inhalt über Tools)

> [!NOTE]
> Vault-Datei-@-Erwähnungen fügen nur den Dateipfad ein - die KI liest den Inhalt über Tools. Dies funktioniert nicht mit Gemma-Modellen (keine Vault-Tool-Unterstützung). Gemini CLI kann Dateien über die Shell lesen, aber das Antwortformat kann abweichen.

## Dateianhänge

Hängen Sie Dateien direkt an: Bilder (PNG, JPEG, GIF, WebP), PDFs, Textdateien

## Function Calling (Vault-Operationen)

Die KI kann mit Ihrem Vault über diese Tools interagieren:

| Tool | Beschreibung |
|------|--------------|
| `read_note` | Notizinhalt lesen |
| `create_note` | Neue Notizen erstellen |
| `propose_edit` | Bearbeiten mit Bestätigungsdialog |
| `propose_delete` | Löschen mit Bestätigungsdialog |
| `bulk_propose_edit` | Massenbearbeitung mehrerer Dateien mit Auswahldialog |
| `bulk_propose_delete` | Massenlöschung mehrerer Dateien mit Auswahldialog |
| `search_notes` | Vault nach Name oder Inhalt durchsuchen |
| `list_notes` | Notizen in Ordner auflisten |
| `rename_note` | Notizen umbenennen/verschieben |
| `create_folder` | Neue Ordner erstellen |
| `list_folders` | Ordner im Vault auflisten |
| `get_active_note_info` | Informationen über aktive Notiz abrufen |
| `get_rag_sync_status` | RAG-Sync-Status prüfen |

## Sicheres Bearbeiten

Wenn die KI `propose_edit` verwendet:
1. Ein Bestätigungsdialog zeigt die vorgeschlagenen Änderungen
2. Klicken Sie auf **Anwenden**, um Änderungen in die Datei zu schreiben
3. Klicken Sie auf **Verwerfen**, um ohne Änderung der Datei abzubrechen

> Änderungen werden NICHT geschrieben, bis Sie bestätigen.

## Bearbeitungsverlauf

Verfolgen und Wiederherstellen von Änderungen an Ihren Notizen:

- **Automatische Verfolgung** - Alle KI-Bearbeitungen (Chat, Workflow) und manuelle Änderungen werden aufgezeichnet
- **Verlauf anzeigen** - Befehl: "Show edit history" oder verwenden Sie die Befehlspalette
- **Diff-Ansicht** - Sehen Sie genau, was sich geändert hat, mit farbcodierten Hinzufügungen/Löschungen
- **Wiederherstellen** - Mit einem Klick zu jeder früheren Version zurückkehren
- **Größenveränderbares Modal** - Ziehen zum Verschieben, Größe an den Ecken ändern

**Diff-Anzeige:**
- `+` Zeilen existierten in der älteren Version
- `-` Zeilen wurden in der neueren Version hinzugefügt

**So funktioniert es:**

Der Bearbeitungsverlauf verwendet einen Snapshot-basierten Ansatz:

1. **Snapshot-Erstellung** - Wenn eine Datei zum ersten Mal geöffnet oder von der KI geändert wird, wird ein Snapshot ihres Inhalts gespeichert
2. **Diff-Aufzeichnung** - Wenn die Datei geändert wird, wird der Unterschied zwischen dem neuen Inhalt und dem Snapshot als Verlaufseintrag aufgezeichnet
3. **Snapshot-Aktualisierung** - Der Snapshot wird nach jeder Änderung auf den neuen Inhalt aktualisiert
4. **Wiederherstellen** - Um zu einer früheren Version zurückzukehren, werden Diffs vom Snapshot rückwärts angewendet

**Wann wird der Verlauf aufgezeichnet:**
- KI-Chat-Bearbeitungen (`propose_edit`-Tool)
- Workflow-Notizänderungen (`note`-Node)
- Manuelle Speicherungen über Befehl
- Auto-Erkennung, wenn die Datei beim Öffnen vom Snapshot abweicht

**Speicherort:**
- Verlaufsdateien: `{workspaceFolder}/history/{filename}.history.md`
- Snapshot-Dateien: `{workspaceFolder}/history/{filename}.snapshot.md`

**Einstellungen:**
- Aktivieren/Deaktivieren in den Plugin-Einstellungen
- Kontextzeilen für Diffs konfigurieren
- Aufbewahrungslimits festlegen (max. Einträge pro Datei, maximales Alter)

![Bearbeitungsverlauf-Modal](edit_history.png)

## RAG

Retrieval-Augmented Generation für intelligente Vault-Suche:

- **Unterstützte Dateien** - Markdown, PDF, Bilder (PNG, JPEG, GIF, WebP)
- **Interner Modus** - Vault-Dateien mit Google File Search synchronisieren
- **Externer Modus** - Bestehende Store-IDs verwenden
- **Inkrementelle Synchronisierung** - Nur geänderte Dateien hochladen
- **Zielordner** - Ordner zum Einschließen angeben
- **Ausschlussmuster** - Regex-Muster zum Ausschließen von Dateien

![RAG-Einstellungen](setting_rag.png)

---

# Workflow Builder

Erstellen Sie automatisierte mehrstufige Workflows direkt in Markdown-Dateien. **Keine Programmierkenntnisse erforderlich** - beschreiben Sie einfach in natürlicher Sprache, was Sie möchten, und die KI erstellt den Workflow für Sie.

![Visueller Workflow-Editor](visual_workflow.png)

## KI-gestützte Workflow-Erstellung

**Sie müssen keine YAML-Syntax oder Node-Typen lernen.** Beschreiben Sie Ihren Workflow einfach in natürlicher Sprache:

1. Öffnen Sie den **Workflow**-Tab in der Gemini-Seitenleiste
2. Wählen Sie **+ New (AI)** aus dem Dropdown
3. Beschreiben Sie, was Sie möchten: *"Erstelle einen Workflow, der die ausgewählte Notiz zusammenfasst und in einem Zusammenfassungsordner speichert"*
4. Klicken Sie auf **Generate** - die KI erstellt den kompletten Workflow

![Workflow mit KI erstellen](create_workflow_with_ai.png)

**Bestehende Workflows auf die gleiche Weise ändern:**
1. Laden Sie einen beliebigen Workflow
2. Klicken Sie auf die Schaltfläche **AI Modify**
3. Beschreiben Sie die Änderungen: *"Füge einen Schritt hinzu, um die Zusammenfassung ins Japanische zu übersetzen"*
4. Überprüfen und anwenden

![KI-Workflow-Änderung](modify_workflow_with_ai.png)

## Schnellstart (Manuell)

Sie können Workflows auch manuell schreiben. Fügen Sie einen Workflow-Codeblock zu einer beliebigen Markdown-Datei hinzu:

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

Öffnen Sie den **Workflow**-Tab in der Gemini-Seitenleiste, um ihn auszuführen.

## Verfügbare Node-Typen

22 Node-Typen stehen für die Workflow-Erstellung zur Verfügung:

| Kategorie | Nodes |
|-----------|-------|
| Variablen | `variable`, `set` |
| Steuerung | `if`, `while` |
| LLM | `command` |
| Daten | `http`, `json` |
| Notizen | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Dateien | `file-explorer`, `file-save` |
| Eingaben | `prompt-file`, `prompt-selection`, `dialog` |
| Komposition | `workflow` |
| RAG | `rag-sync` |
| Extern | `mcp`, `obsidian-command` |

> **Für detaillierte Node-Spezifikationen und Beispiele siehe [WORKFLOW_NODES_de.md](WORKFLOW_NODES_de.md)**

## Tastenkürzel-Modus

Weisen Sie Tastenkürzel zu, um Workflows sofort auszuführen:

1. Fügen Sie ein `name:`-Feld zu Ihrem Workflow hinzu
2. Öffnen Sie die Workflow-Datei und wählen Sie den Workflow aus dem Dropdown
3. Klicken Sie auf das Tastatur-Symbol (⌨️) in der Workflow-Panel-Fußzeile
4. Gehen Sie zu Einstellungen → Tastenkürzel → suchen Sie "Workflow: [Ihr Workflow-Name]"
5. Weisen Sie ein Tastenkürzel zu (z.B. `Ctrl+Shift+T`)

Bei Auslösung durch Tastenkürzel:
- `prompt-file` verwendet automatisch die aktive Datei (kein Dialog)
- `prompt-selection` verwendet die aktuelle Auswahl, oder den gesamten Dateiinhalt, wenn keine Auswahl vorhanden ist

## Ereignis-Trigger

Workflows können automatisch durch Obsidian-Ereignisse ausgelöst werden:

![Ereignis-Trigger-Einstellungen](event_setting.png)

| Ereignis | Beschreibung |
|----------|--------------|
| File Created | Wird ausgelöst, wenn eine neue Datei erstellt wird |
| File Modified | Wird ausgelöst, wenn eine Datei gespeichert wird (entprellt 5s) |
| File Deleted | Wird ausgelöst, wenn eine Datei gelöscht wird |
| File Renamed | Wird ausgelöst, wenn eine Datei umbenannt wird |
| File Opened | Wird ausgelöst, wenn eine Datei geöffnet wird |

**Ereignis-Trigger einrichten:**
1. Fügen Sie ein `name:`-Feld zu Ihrem Workflow hinzu
2. Öffnen Sie die Workflow-Datei und wählen Sie den Workflow aus dem Dropdown
3. Klicken Sie auf das Blitz-Symbol (⚡) in der Workflow-Panel-Fußzeile
4. Wählen Sie, welche Ereignisse den Workflow auslösen sollen
5. Fügen Sie optional einen Dateimusterfilter hinzu

**Dateimuster-Beispiele:**
- `**/*.md` - Alle Markdown-Dateien in jedem Ordner
- `journal/*.md` - Markdown-Dateien nur im Journal-Ordner
- `*.md` - Markdown-Dateien nur im Stammordner
- `**/{daily,weekly}/*.md` - Dateien in Daily- oder Weekly-Ordnern
- `projects/[a-z]*.md` - Dateien, die mit Kleinbuchstaben beginnen

**Ereignis-Variablen:** Bei Auslösung durch ein Ereignis werden diese Variablen automatisch gesetzt:

| Variable | Beschreibung |
|----------|--------------|
| `__eventType__` | Ereignistyp: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Pfad der betroffenen Datei |
| `__eventFile__` | JSON mit Dateiinformationen (path, basename, name, extension) |
| `__eventFileContent__` | Dateiinhalt (für create/modify/file-open-Ereignisse) |
| `__eventOldPath__` | Vorheriger Pfad (nur für Umbenennungs-Ereignisse) |

> **Hinweis:** `prompt-file`- und `prompt-selection`-Nodes verwenden automatisch die Ereignis-Datei, wenn sie durch Ereignisse ausgelöst werden. `prompt-selection` verwendet den gesamten Dateiinhalt als Auswahl.

---

# Allgemeines

## Unterstützte Modelle

### Kostenpflichtiger Plan
| Modell | Beschreibung |
|--------|--------------|
| Gemini 3 Flash Preview | Schnelles Modell, 1M Kontext (Standard) |
| Gemini 3 Pro Preview | Flaggschiff-Modell, 1M Kontext |
| Gemini 2.5 Flash Lite | Leichtgewichtiges Flash-Modell |
| Gemini 2.5 Flash (Image) | Bilderzeugung, 1024px |
| Gemini 3 Pro (Image) | Pro-Bilderzeugung, 4K |

### Kostenloser Plan
| Modell | Vault-Operationen |
|--------|-------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Installation

### BRAT (Empfohlen)
1. Installieren Sie das [BRAT](https://github.com/TfTHacker/obsidian42-brat)-Plugin
2. Öffnen Sie BRAT-Einstellungen → "Add Beta plugin"
3. Geben Sie ein: `https://github.com/takeshy/obsidian-gemini-helper`
4. Aktivieren Sie das Plugin in den Community-Plugin-Einstellungen

### Manuell
1. Laden Sie `main.js`, `manifest.json`, `styles.css` von den Releases herunter
2. Erstellen Sie einen `gemini-helper`-Ordner in `.obsidian/plugins/`
3. Kopieren Sie die Dateien und aktivieren Sie in den Obsidian-Einstellungen

### Aus dem Quellcode
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Konfiguration

### API-Einstellungen
1. Holen Sie sich einen API-Schlüssel von [ai.google.dev](https://ai.google.dev)
2. Geben Sie ihn in den Plugin-Einstellungen ein
3. Wählen Sie den API-Plan (Kostenlos/Kostenpflichtig)

![Grundeinstellungen](setting_basic.png)

### CLI-Modus (Gemini / Claude / Codex)

**Gemini CLI:**
1. Installieren Sie [Gemini CLI](https://github.com/google-gemini/gemini-cli)
2. Authentifizieren Sie sich mit `gemini` → `/auth`
3. Klicken Sie auf "Verify" im Gemini CLI-Bereich

**Claude CLI:**
1. Installieren Sie [Claude Code](https://github.com/anthropics/claude-code): `npm install -g @anthropic-ai/claude-code`
2. Authentifizieren Sie sich mit `claude`
3. Klicken Sie auf "Verify" im Claude CLI-Bereich

**Codex CLI:**
1. Installieren Sie [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
2. Authentifizieren Sie sich mit `codex`
3. Klicken Sie auf "Verify" im Codex CLI-Bereich

**CLI-Einschränkungen:** Nur-Lese-Vault-Operationen, keine semantische/Websuche

### Workspace-Einstellungen
- **Workspace Folder** - Speicherort für Chat-Verlauf und Einstellungen
- **System Prompt** - Zusätzliche KI-Anweisungen
- **Tool Limits** - Steuerung der Function-Call-Limits
- **Edit History** - Verfolgen und Wiederherstellen von KI-Änderungen

![Tool-Limits & Bearbeitungsverlauf](setting_tool_history.png)

### Slash-Befehle
- Benutzerdefinierte Prompt-Vorlagen definieren, die mit `/` ausgelöst werden
- Optionale Modell- und Suchüberschreibung pro Befehl

![Slash-Befehle](setting_slash_command.png)

## Verwendung

### Chat öffnen
- Klicken Sie auf das Gemini-Symbol im Ribbon
- Befehl: "Gemini Helper: Open chat"
- Umschalten: "Gemini Helper: Toggle chat / editor"

### Chat-Steuerung
- **Enter** - Nachricht senden
- **Shift+Enter** - Neue Zeile
- **Stop-Schaltfläche** - Generierung stoppen
- **+-Schaltfläche** - Neuer Chat
- **Verlauf-Schaltfläche** - Frühere Chats laden

### Workflows verwenden
1. Öffnen Sie den **Workflow**-Tab in der Seitenleiste
2. Öffnen Sie eine Datei mit `workflow`-Codeblock
3. Wählen Sie einen Workflow aus dem Dropdown
4. Klicken Sie auf **Run**, um auszuführen
5. Klicken Sie auf **History**, um vergangene Durchläufe anzuzeigen

![Workflow-Verlauf](workflow_history.png)

**Export in Canvas:** Zeigen Sie den Ausführungsverlauf als Obsidian Canvas zur visuellen Analyse an.

![Verlaufs-Canvas-Ansicht](history_canvas.png)

### KI-Workflow-Generierung

**Neuen Workflow mit KI erstellen:**
1. Wählen Sie **+ New (AI)** aus dem Workflow-Dropdown
2. Geben Sie Workflow-Namen und Ausgabepfad ein (unterstützt `{{name}}`-Variable)
3. Beschreiben Sie in natürlicher Sprache, was der Workflow tun soll
4. Wählen Sie ein Modell und klicken Sie auf **Generate**
5. Der Workflow wird automatisch erstellt und gespeichert

**Bestehenden Workflow mit KI ändern:**
1. Laden Sie einen bestehenden Workflow
2. Klicken Sie auf die Schaltfläche **AI Modify** (Funkelsymbol)
3. Beschreiben Sie die gewünschten Änderungen
4. Überprüfen Sie den Vorher/Nachher-Vergleich
5. Klicken Sie auf **Apply Changes**, um zu aktualisieren

![KI-Workflow-Änderung](modify_workflow_with_ai.png)

**Manuelle Workflow-Bearbeitung:**

Bearbeiten Sie Workflows direkt im visuellen Node-Editor mit Drag-and-Drop-Oberfläche.

![Manuelle Workflow-Bearbeitung](modify_workflow_manual.png)

**Aus Datei neu laden:**
- Wählen Sie **Reload from file** aus dem Dropdown, um den Workflow aus der Markdown-Datei neu zu importieren

## Anforderungen

- Obsidian v0.15.0+
- Google AI API-Schlüssel oder CLI-Tool (Gemini CLI / Claude CLI / Codex CLI)
- Desktop und Mobil unterstützt (CLI-Modus: nur Desktop)

## Datenschutz

**Lokal gespeicherte Daten:**
- API-Schlüssel (in Obsidian-Einstellungen gespeichert)
- Chat-Verlauf (als Markdown-Dateien)
- Workflow-Ausführungsverlauf

**An Google gesendete Daten:**
- Alle Chat-Nachrichten und Dateianhänge werden zur Verarbeitung an die Google Gemini API gesendet
- Bei aktiviertem RAG werden Vault-Dateien zu Google File Search hochgeladen
- Bei aktivierter Websuche werden Anfragen an Google Search gesendet

**An Drittanbieter gesendete Daten:**
- Workflow-`http`-Nodes können Daten an jede im Workflow angegebene URL senden

**CLI-Anbieter (optional):**
- Bei aktiviertem CLI-Modus werden externe CLI-Tools (gemini, claude, codex) über child_process ausgeführt
- Dies geschieht nur, wenn es vom Benutzer explizit konfiguriert und verifiziert wurde
- Der CLI-Modus ist nur für Desktop verfügbar (nicht auf Mobilgeräten)

**Sicherheitshinweise:**
- Überprüfen Sie Workflows vor der Ausführung - `http`-Nodes können Vault-Daten an externe Endpunkte übertragen
- Workflow-`note`-Nodes zeigen standardmäßig einen Bestätigungsdialog vor dem Schreiben von Dateien
- Slash-Befehle mit `confirmEdits: false` wenden Dateiänderungen automatisch an, ohne Anwenden/Verwerfen-Schaltflächen anzuzeigen

Siehe [Google AI Nutzungsbedingungen](https://ai.google.dev/terms) für Datenaufbewahrungsrichtlinien.

## Lizenz

MIT

## Links

- [Gemini API-Dokumentation](https://ai.google.dev/docs)
- [Obsidian Plugin-Dokumentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Unterstützung

Wenn Sie dieses Plugin nützlich finden, spendieren Sie mir einen Kaffee!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
