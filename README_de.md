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
- **Verschlüsselung** - Passwortschutz für Chat-Verlauf und Workflow-Ausführungsprotokolle

![Bilderzeugung im Chat](docs/images/chat_image.png)

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

![Chat-Oberfläche](docs/images/chat.png)

## Slash-Befehle

Erstellen Sie wiederverwendbare Prompt-Vorlagen, die mit `/` ausgelöst werden:

- Definieren Sie Vorlagen mit `{selection}` (ausgewählter Text) und `{content}` (aktive Notiz)
- Optionale Modell- und Suchüberschreibung pro Befehl
- Tippen Sie `/`, um verfügbare Befehle anzuzeigen

**Standard:** `/infographic` - Konvertiert Inhalte in HTML-Infografiken

![Infografik-Beispiel](docs/images/chat_infographic.png)

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

### Vault-Tool-Modus

Steuern Sie, welche Vault-Tools die KI verwenden kann, über das Datenbank-Symbol (📦) unter dem Anhang-Button:

| Modus | Beschreibung | Verfügbare Tools |
|-------|--------------|------------------|
| **Vault: Alle** | Voller Vault-Zugriff | Alle Tools |
| **Vault: Ohne Suche** | Suchwerkzeuge ausschließen | Alle außer `search_notes`, `list_notes` |
| **Vault: Aus** | Kein Vault-Zugriff | Keine |

**Automatische Modusauswahl:**

| Bedingung | Standardmodus | Änderbar |
|-----------|---------------|----------|
| CLI-Modelle (Gemini/Claude/Codex CLI) | Vault: Aus | Nein |
| Gemma-Modelle | Vault: Aus | Nein |
| Web Search aktiviert | Vault: Aus | Nein |
| Flash Lite + RAG | Vault: Aus | Nein |
| RAG aktiviert | Vault: Ohne Suche | Ja |
| Kein RAG | Vault: Alle | Ja |

> **Tipp:** Bei der Verwendung von RAG wird "Vault: Ohne Suche" empfohlen, um redundante Suchen zu vermeiden – RAG bietet bereits semantische Suche über Ihren Vault.

## Sicheres Bearbeiten

Wenn die KI `propose_edit` verwendet:
1. Ein Bestätigungsdialog zeigt die vorgeschlagenen Änderungen
2. Klicken Sie auf **Anwenden**, um Änderungen in die Datei zu schreiben
3. Klicken Sie auf **Verwerfen**, um ohne Änderung der Datei abzubrechen

> Änderungen werden NICHT geschrieben, bis Sie bestätigen.

## Bearbeitungsverlauf

Verfolgen und Wiederherstellen von Änderungen an Ihren Notizen:

- **Automatische Verfolgung** - Alle KI-Bearbeitungen (Chat, Workflow) und manuelle Änderungen werden aufgezeichnet
- **Dateimenü-Zugriff** - Rechtsklick auf eine Markdown-Datei für Zugriff auf:
  - **Snapshot** - Aktuellen Zustand als Snapshot speichern
  - **History** - Bearbeitungsverlauf-Modal öffnen

![Dateimenü](docs/images/snap_history.png)

- **Befehlspalette** - Auch verfügbar über den Befehl "Show edit history"
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

![Bearbeitungsverlauf-Modal](docs/images/edit_history.png)

## RAG

Retrieval-Augmented Generation für intelligente Vault-Suche:

- **Unterstützte Dateien** - Markdown, PDF, Bilder (PNG, JPEG, GIF, WebP)
- **Interner Modus** - Vault-Dateien mit Google File Search synchronisieren
- **Externer Modus** - Bestehende Store-IDs verwenden
- **Inkrementelle Synchronisierung** - Nur geänderte Dateien hochladen
- **Zielordner** - Ordner zum Einschließen angeben
- **Ausschlussmuster** - Regex-Muster zum Ausschließen von Dateien

![RAG-Einstellungen](docs/images/setting_rag.png)

## MCP-Server

MCP (Model Context Protocol)-Server bieten zusätzliche Werkzeuge, die die Fähigkeiten der KI über Vault-Operationen hinaus erweitern.

**Einrichtung:**

1. Plugin-Einstellungen öffnen → Abschnitt **MCP-Server**
2. Auf **Server hinzufügen** klicken
3. Servername und URL eingeben
4. Optionale Header (JSON-Format) für Authentifizierung konfigurieren
5. Auf **Verbindung testen** klicken, um zu verifizieren und verfügbare Werkzeuge abzurufen
6. Serverkonfiguration speichern

> **Hinweis:** Der Verbindungstest ist vor dem Speichern erforderlich. Dies stellt sicher, dass der Server erreichbar ist und zeigt die verfügbaren Werkzeuge an.

![MCP-Server-Einstellungen](docs/images/setting_mcp.png)

**Verwendung von MCP-Werkzeugen:**

- **Im Chat:** Klicken Sie auf das Datenbank-Symbol (📦), um die Werkzeugeinstellungen zu öffnen. Aktivieren/deaktivieren Sie MCP-Server pro Konversation.
- **In Workflows:** Verwenden Sie den `mcp`-Knoten, um MCP-Server-Werkzeuge aufzurufen.

**Werkzeughinweise:** Nach einem erfolgreichen Verbindungstest werden die Namen der verfügbaren Werkzeuge gespeichert und sowohl in den Einstellungen als auch in der Chat-Oberfläche angezeigt.

---

# Workflow Builder

Erstellen Sie automatisierte mehrstufige Workflows direkt in Markdown-Dateien. **Keine Programmierkenntnisse erforderlich** - beschreiben Sie einfach in natürlicher Sprache, was Sie möchten, und die KI erstellt den Workflow für Sie.

![Visueller Workflow-Editor](docs/images/visual_workflow.png)

## KI-gestützte Workflow-Erstellung

**Sie müssen keine YAML-Syntax oder Node-Typen lernen.** Beschreiben Sie Ihren Workflow einfach in natürlicher Sprache:

1. Öffnen Sie den **Workflow**-Tab in der Gemini-Seitenleiste
2. Wählen Sie **+ New (AI)** aus dem Dropdown
3. Beschreiben Sie, was Sie möchten: *"Erstelle einen Workflow, der die ausgewählte Notiz zusammenfasst und in einem Zusammenfassungsordner speichert"*
4. Klicken Sie auf **Generate** - die KI erstellt den kompletten Workflow

![Workflow mit KI erstellen](docs/images/create_workflow_with_ai.png)

**Bestehende Workflows auf die gleiche Weise ändern:**
1. Laden Sie einen beliebigen Workflow
2. Klicken Sie auf die Schaltfläche **AI Modify**
3. Beschreiben Sie die Änderungen: *"Füge einen Schritt hinzu, um die Zusammenfassung ins Japanische zu übersetzen"*
4. Überprüfen und anwenden

![KI-Workflow-Änderung](docs/images/modify_workflow_with_ai.png)

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

> **Für detaillierte Node-Spezifikationen und Beispiele siehe [WORKFLOW_NODES_de.md](docs/WORKFLOW_NODES_de.md)**

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

![Ereignis-Trigger-Einstellungen](docs/images/event_setting.png)

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

![Grundeinstellungen](docs/images/setting_basic.png)

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

![Tool-Limits & Bearbeitungsverlauf](docs/images/setting_tool_history.png)

### Verschlüsselung

Schützen Sie Ihren Chat-Verlauf und Workflow-Ausführungsprotokolle separat mit Passwort.

**Einrichtung:**

1. Legen Sie ein Passwort in den Plugin-Einstellungen fest (sicher gespeichert mittels Public-Key-Kryptographie)

![Initiale Verschlüsselungseinrichtung](docs/images/setting_initial_encryption.png)

2. Nach der Einrichtung aktivieren Sie die Verschlüsselung für jeden Protokolltyp:
   - **AI-Chat-Verlauf verschlüsseln** - Verschlüsselt Chat-Konversationsdateien
   - **Workflow-Ausführungsprotokolle verschlüsseln** - Verschlüsselt Workflow-Verlaufsdateien

![Verschlüsselungseinstellungen](docs/images/setting_encryption.png)

Jede Einstellung kann unabhängig aktiviert/deaktiviert werden.

**Funktionen:**
- **Separate Steuerung** - Wählen Sie, welche Protokolle verschlüsselt werden sollen (Chat, Workflow oder beide)
- **Automatische Verschlüsselung** - Neue Dateien werden beim Speichern basierend auf den Einstellungen verschlüsselt
- **Passwort-Caching** - Passwort einmal pro Sitzung eingeben
- **Dedizierter Viewer** - Verschlüsselte Dateien öffnen sich in einem sicheren Editor mit Vorschau
- **Entschlüsselungsoption** - Verschlüsselung bei Bedarf von einzelnen Dateien entfernen

**Funktionsweise:**

```
[Setup - einmalig bei Passwortvergabe]
Passwort → Schlüsselpaar generieren (RSA) → Privaten Schlüssel verschlüsseln → In Einstellungen speichern

[Verschlüsselung - pro Datei]
Dateiinhalt → Mit neuem AES-Schlüssel verschlüsseln → AES-Schlüssel mit öffentlichem Schlüssel verschlüsseln
→ In Datei speichern: verschlüsselte Daten + verschlüsselter privater Schlüssel (aus Einstellungen) + Salt

[Entschlüsselung]
Passwort + Salt → Privaten Schlüssel wiederherstellen → AES-Schlüssel entschlüsseln → Inhalt entschlüsseln
```

- Schlüsselpaar wird einmalig generiert (RSA-Generierung ist langsam), AES-Schlüssel wird pro Datei generiert
- Jede Datei speichert: verschlüsselten Inhalt + verschlüsselten privaten Schlüssel (aus Einstellungen kopiert) + Salt
- Dateien sind eigenständig — nur mit Passwort entschlüsselbar, keine Plugin-Abhängigkeit

<details>
<summary>Python-Entschlüsselungsskript (zum Erweitern klicken)</summary>

```python
#!/usr/bin/env python3
"""Gemini Helper verschlüsselte Dateien ohne Plugin entschlüsseln."""
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
        raise ValueError("Ungültiges verschlüsseltes Dateiformat")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("Key oder Salt fehlt im Frontmatter")

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
        print(f"Verwendung: {sys.argv[0]} <verschlüsselte_datei>")
        sys.exit(1)
    password = getpass.getpass("Passwort: ")
    print(decrypt_file(sys.argv[1], password))
```

Benötigt: `pip install cryptography`

</details>

> **Warnung:** Wenn Sie Ihr Passwort vergessen, können verschlüsselte Dateien nicht wiederhergestellt werden. Bewahren Sie Ihr Passwort sicher auf.

> **Tipp:** Um alle Dateien in einem Verzeichnis auf einmal zu verschlüsseln, verwenden Sie einen Workflow. Siehe das Beispiel "Alle Dateien in einem Verzeichnis verschlüsseln" in [WORKFLOW_NODES_de.md](docs/WORKFLOW_NODES_de.md#obsidian-command).

![Dateiverschlüsselungs-Workflow](docs/images/enc.png)

**Sicherheitsvorteile:**
- **Geschützt vor AI-Chat** - Verschlüsselte Dateien können nicht von AI-Vault-Operationen (`read_note`-Tool) gelesen werden. Dies schützt sensible Daten wie API-Schlüssel vor versehentlicher Offenlegung während des Chats.
- **Workflow-Zugriff mit Passwort** - Workflows können verschlüsselte Dateien mit dem `note-read`-Knoten lesen. Beim Zugriff erscheint ein Passwort-Dialog, und das Passwort wird für die Sitzung zwischengespeichert.
- **Geheimnisse sicher speichern** - Anstatt API-Schlüssel direkt in Workflows zu schreiben, speichern Sie sie in verschlüsselten Dateien. Der Workflow liest den Schlüssel zur Laufzeit nach der Passwortverifizierung.

### Slash-Befehle
- Benutzerdefinierte Prompt-Vorlagen definieren, die mit `/` ausgelöst werden
- Optionale Modell- und Suchüberschreibung pro Befehl

![Slash-Befehle](docs/images/setting_slash_command.png)

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

**Von der Seitenleiste:**
1. Öffnen Sie den **Workflow**-Tab in der Seitenleiste
2. Öffnen Sie eine Datei mit `workflow`-Codeblock
3. Wählen Sie einen Workflow aus dem Dropdown
4. Klicken Sie auf **Run**, um auszuführen
5. Klicken Sie auf **History**, um vergangene Durchläufe anzuzeigen

**Von der Befehlspalette (Run Workflow):**

Verwenden Sie den Befehl "Gemini Helper: Run Workflow", um Workflows von überall zu durchsuchen und auszuführen:

1. Öffnen Sie die Befehlspalette und suchen Sie nach "Run Workflow"
2. Durchsuchen Sie alle Vault-Dateien mit Workflow-Codeblöcken (Dateien im `workflows/`-Ordner werden zuerst angezeigt)
3. Zeigen Sie den Workflow-Inhalt und die AI-Generierungshistorie in der Vorschau an
4. Wählen Sie einen Workflow und klicken Sie auf **Run**, um auszuführen

![Workflow-Ausführen-Modal](docs/images/workflow_list.png)

Dies ist nützlich, um Workflows schnell auszuführen, ohne zuerst zur Workflow-Datei navigieren zu müssen.

![Workflow-Verlauf](docs/images/workflow_history.png)

**Als Flussdiagramm visualisieren:** Klicken Sie auf die **Canvas**-Schaltfläche (Gittersymbol) im Workflow-Panel, um Ihren Workflow als Obsidian Canvas zu exportieren. Dies erstellt ein visuelles Flussdiagramm, bei dem:
- Schleifen und Verzweigungen mit korrekter Routenführung klar dargestellt werden
- Entscheidungsknoten (`if`/`while`) Ja/Nein-Pfade anzeigen
- Rückwärtspfeile für Schleifen um Knoten herum geleitet werden
- Jeder Knoten seine vollständige Konfiguration anzeigt
- Ein Link zur Quell-Workflow-Datei für schnelle Navigation enthalten ist

![Workflow to Canvas](docs/images/workflow_to_canvas.png)

Dies ist besonders hilfreich zum Verständnis komplexer Workflows mit mehreren Verzweigungen und Schleifen.

**Ausführungsverlauf exportieren:** Zeigen Sie den Ausführungsverlauf als Obsidian Canvas zur visuellen Analyse an. Klicken Sie auf **Open Canvas view** im History-Modal, um eine Canvas-Datei zu erstellen.

> **Hinweis:** Canvas-Dateien werden dynamisch im Workspace-Ordner erstellt. Löschen Sie sie nach der Überprüfung manuell, wenn sie nicht mehr benötigt werden.

![Verlaufs-Canvas-Ansicht](docs/images/history_canvas.png)

### KI-Workflow-Generierung

**Neuen Workflow mit KI erstellen:**
1. Wählen Sie **+ New (AI)** aus dem Workflow-Dropdown
2. Geben Sie Workflow-Namen und Ausgabepfad ein (unterstützt `{{name}}`-Variable)
3. Beschreiben Sie in natürlicher Sprache, was der Workflow tun soll
4. Wählen Sie ein Modell und klicken Sie auf **Generate**
5. Der Workflow wird automatisch erstellt und gespeichert

> **Tipp:** Wenn Sie **+ New (AI)** aus dem Dropdown bei einer Datei verwenden, die bereits Workflows enthält, wird der Ausgabepfad standardmäßig auf die aktuelle Datei gesetzt. Der generierte Workflow wird an diese Datei angehängt.

**Workflow von beliebiger Datei erstellen:**

Wenn Sie den Workflow-Tab mit einer Datei öffnen, die keinen Workflow-Codeblock hat, wird eine **"Create workflow with AI"**-Schaltfläche angezeigt. Klicken Sie darauf, um einen neuen Workflow zu generieren (Standard-Ausgabe: `workflows/{{name}}.md`).

**@ Dateireferenzen:**

Geben Sie `@` im Beschreibungsfeld ein, um Dateien zu referenzieren:
- `@{selection}` - Aktuelle Editor-Auswahl
- `@{content}` - Inhalt der aktiven Notiz
- `@path/to/file.md` - Beliebige Vault-Datei

Wenn Sie auf Generate klicken, wird der Dateiinhalt direkt in die KI-Anfrage eingebettet. YAML-Frontmatter wird automatisch entfernt.

> **Tipp:** Dies ist nützlich, um Workflows basierend auf bestehenden Workflow-Beispielen oder Vorlagen in Ihrem Vault zu erstellen.

**Dateianhänge:**

Klicken Sie auf die Anhang-Schaltfläche, um Dateien (Bilder, PDFs, Textdateien) an Ihre Workflow-Generierungsanfrage anzuhängen. Dies ist nützlich, um der KI visuellen Kontext oder Beispiele zu liefern.

**Modal-Steuerung:**

Das KI-Workflow-Modal unterstützt Drag-and-Drop-Positionierung und Größenänderung von den Ecken für eine bessere Bearbeitungserfahrung.

**Anfrageverlauf:**

Jeder KI-generierte Workflow speichert einen Verlaufseintrag über dem Workflow-Codeblock, einschließlich:
- Zeitstempel und Aktion (Erstellt/Geändert)
- Ihre Anfragebeschreibung
- Referenzierte Dateiinhalte (in zusammenklappbaren Abschnitten)

![Workflow AI-Verlauf](docs/images/workflow_ai_history.png)

**Bestehenden Workflow mit KI ändern:**
1. Laden Sie einen bestehenden Workflow
2. Klicken Sie auf die Schaltfläche **AI Modify** (Funkelsymbol)
3. Beschreiben Sie die gewünschten Änderungen
4. Überprüfen Sie den Vorher/Nachher-Vergleich
5. Klicken Sie auf **Apply Changes**, um zu aktualisieren

![KI-Workflow-Änderung](docs/images/modify_workflow_with_ai.png)

**Ausführungsverlauf-Referenz:**

Beim Ändern eines Workflows mit KI können Sie auf vorherige Ausführungsergebnisse verweisen, um der KI Probleme zu erklären:

1. Klicken Sie auf die Schaltfläche **Ausführungsverlauf referenzieren**
2. Wählen Sie einen Ausführungslauf aus der Liste (Fehlerläufe sind hervorgehoben)
3. Wählen Sie die einzuschließenden Schritte (Fehlerschritte sind vorausgewählt)
4. Die KI erhält die Schritt-Input/Output-Daten, um zu verstehen, was schief gelaufen ist

Dies ist besonders nützlich zum Debuggen von Workflows - Sie können der KI sagen "Behebe den Fehler in Schritt 2" und sie sieht genau, welche Eingabe den Fehler verursacht hat.

**Anfrageverlauf:**

Beim Regenerieren eines Workflows (Klicken auf "Nein" in der Vorschau) werden alle vorherigen Anfragen der Sitzung an die KI übergeben. Dies hilft der KI, den vollständigen Kontext Ihrer Änderungen über mehrere Iterationen hinweg zu verstehen.

**Manuelle Workflow-Bearbeitung:**

Bearbeiten Sie Workflows direkt im visuellen Node-Editor mit Drag-and-Drop-Oberfläche.

![Manuelle Workflow-Bearbeitung](docs/images/modify_workflow_manual.png)

**Aus Datei neu laden:**
- Wählen Sie **Reload from file** aus dem Dropdown, um den Workflow aus der Markdown-Datei neu zu importieren

## Anforderungen

- Obsidian v0.15.0+
- Google AI API-Schlüssel oder CLI-Tool (Gemini CLI / Claude CLI / Codex CLI)
- Desktop und Mobil unterstützt (CLI-Modus: nur Desktop)

## Datenschutz

**Lokal gespeicherte Daten:**
- API-Schlüssel (in Obsidian-Einstellungen gespeichert)
- Chat-Verlauf (als Markdown-Dateien, optional verschlüsselt)
- Workflow-Ausführungsverlauf (optional verschlüsselt)
- Verschlüsselungsschlüssel (privater Schlüssel mit Ihrem Passwort verschlüsselt)

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

**MCP-Server (optional):**
- MCP-Server (Model Context Protocol) können in den Plugin-Einstellungen für Workflow-`mcp`-Nodes konfiguriert werden
- MCP-Server sind externe Dienste, die zusätzliche Tools und Funktionen bereitstellen

**Sicherheitshinweise:**
- Überprüfen Sie Workflows vor der Ausführung - `http`-Nodes können Vault-Daten an externe Endpunkte übertragen
- Workflow-`note`-Nodes zeigen standardmäßig einen Bestätigungsdialog vor dem Schreiben von Dateien
- Slash-Befehle mit `confirmEdits: false` wenden Dateiänderungen automatisch an, ohne Anwenden/Verwerfen-Schaltflächen anzuzeigen
- Sensible Anmeldedaten: Speichern Sie API-Schlüssel oder Tokens nicht direkt im Workflow-YAML (`http`-Header, `mcp`-Einstellungen usw.). Speichern Sie diese stattdessen in verschlüsselten Dateien und verwenden Sie den `note-read`-Node, um sie zur Laufzeit abzurufen. Workflows können verschlüsselte Dateien mit Passwortabfrage lesen.

Siehe [Google AI Nutzungsbedingungen](https://ai.google.dev/terms) für Datenaufbewahrungsrichtlinien.

## Lizenz

MIT

## Links

- [Gemini API-Dokumentation](https://ai.google.dev/docs)
- [Obsidian Plugin-Dokumentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Unterstützung

Wenn Sie dieses Plugin nützlich finden, spendieren Sie mir einen Kaffee!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
