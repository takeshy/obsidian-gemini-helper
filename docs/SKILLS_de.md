# Agent-Skills

Agent-Skills erweitern die Fähigkeiten der KI durch benutzerdefinierte Anweisungen, Referenzmaterialien und ausführbare Workflows. Skills folgen dem branchenüblichen Muster, das von Tools wie [OpenAI Codex](https://github.com/openai/codex) verwendet wird.

## Ordnerstruktur

Skills werden in einem konfigurierbaren Ordner innerhalb Ihres Vaults gespeichert (Standard: `skills/`). Jeder Skill ist ein Unterordner mit einer `SKILL.md`-Datei:

```
skills/
├── code-review/
│   ├── SKILL.md            # Skill-Definition (erforderlich)
│   ├── references/          # Referenzdokumente (optional)
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # Ausführbare Workflows (optional)
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## SKILL.md-Format

Jede `SKILL.md`-Datei hat YAML-Frontmatter für Metadaten und einen Markdown-Body für Anweisungen:

```markdown
---
name: Code Review
description: Reviews code blocks in notes for quality and best practices
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
---

You are a code review assistant. When reviewing code:

1. Check for common bugs and anti-patterns
2. Suggest improvements for readability
3. Verify error handling is adequate
4. Reference the style guide for formatting rules
```

### Frontmatter-Felder

| Feld | Erforderlich | Beschreibung |
|------|-------------|--------------|
| `name` | Nein | Anzeigename für den Skill. Standard ist der Ordnername |
| `description` | Nein | Kurzbeschreibung, die im Skill-Auswahldialog angezeigt wird |
| `workflows` | Nein | Liste von Workflow-Referenzen (siehe unten) |

### Workflow-Referenzen

Workflows, die im Frontmatter deklariert werden, werden als Function-Calling-Werkzeuge registriert, die die KI aufrufen kann:

```yaml
workflows:
  - path: workflows/run-lint.md
    name: lint              # Optionale benutzerdefinierte ID (Standard: pfadbasierte ID)
    description: Run linting on the current note
```

Workflows im Unterverzeichnis `workflows/` werden auch ohne Frontmatter-Deklarationen automatisch erkannt. Automatisch erkannte Workflows verwenden den Dateinamen als Beschreibung.

## Referenzen

Legen Sie Referenzdokumente in einem Unterordner `references/` ab. Diese werden automatisch geladen und in den Kontext der KI einbezogen, wenn der Skill aktiv ist. Verwenden Sie Referenzen für:

- Styleguides und Programmierstandards
- Vorlagen und Beispiele
- Checklisten und Verfahren
- Domänenspezifisches Wissen

## Workflows

Skill-Workflows verwenden dasselbe Format wie der [Workflow Builder](../README_de.md#workflow-builder). Legen Sie Workflow-Markdown-Dateien im Unterordner `workflows/` ab:

````markdown
```workflow
name: Run Lint
nodes:
  - id: read
    type: prompt-file
    saveTo: file
  - id: lint
    type: command
    prompt: "Check the following for lint issues:\n{{file.content}}"
    saveTo: result
  - id: show
    type: dialog
    title: Lint Results
    message: "{{result}}"
```
````

Wenn ein Skill mit Workflows aktiv ist, erhält die KI ein `run_skill_workflow`-Werkzeug, mit dem sie diese Workflows ausführen kann. Das Workflow-ID-Format ist `skillName/workflowName` (z.B. `Code Review/workflows_run-lint`).

### Interaktive Ausführung

Skill-Workflows werden mit interaktiven Modals ausgeführt (wie im Workflow-Panel):

- Ein Fortschrittsmodal zeigt den Echtzeit-Status an
- Interaktive Eingabeaufforderungen (`dialog`, `prompt-file`, `prompt-selection`) werden dem Benutzer angezeigt
- Bestätigungsdialoge erfordern die Zustimmung des Benutzers
- Die KI erhält die Workflow-Ausführungsprotokolle als Werkzeugergebnis

## Skills im Chat verwenden

### Einrichtung

1. Öffnen Sie die Plugin-Einstellungen
2. Suchen Sie den Abschnitt **Agent-Skills**
3. Legen Sie den Skills-Ordner-Pfad fest (Standard: `skills`)

### Skills aktivieren

Skills erscheinen im Chat-Eingabebereich, wenn sie verfügbar sind:

1. Klicken Sie auf die **+**-Schaltfläche neben dem Skills-Chip-Bereich
2. Wählen Sie Skills aus dem Dropdown, um sie zu aktivieren
3. Aktive Skills werden als Chips angezeigt, die durch Klicken auf **x** entfernt werden können

Wenn Skills aktiv sind:

- Skill-Anweisungen und Referenzen werden in den System-Prompt eingefügt
- Wenn Skills Workflows haben, wird das `run_skill_workflow`-Werkzeug verfügbar
- Die Assistenznachricht zeigt an, welche Skills verwendet wurden

### Slash-Befehl

Sie können einen Skill direkt aufrufen, indem Sie `/folder-name` in die Chat-Eingabe eingeben:

- **`/folder-name`** — Aktiviert den Skill und sendet sofort. Die KI nutzt proaktiv die Anweisungen und Workflows des Skills.
- **`/folder-name Ihre Nachricht`** — Aktiviert den Skill und sendet „Ihre Nachricht" mit.
- Die Autovervollständigung zeigt verfügbare Skills an, wenn Sie `/` eingeben. Die Auswahl sendet sofort.

Der Ordnername (nicht der Anzeigename des Skills) wird als Befehl verwendet — z.B. wird ein Skill unter `skills/weekly-report/` mit `/weekly-report` aufgerufen.

### CLI-Modus-Unterstützung

Skills funktionieren auch mit CLI-Backends (Gemini CLI, Claude CLI, Codex CLI). Da CLI-Anbieter kein Function Calling unterstützen, verwenden Skill-Workflows eine textbasierte Konvention: Die KI gibt einen `[RUN_WORKFLOW: workflowId]`-Marker aus, und das Plugin führt den Workflow automatisch aus und zeigt das Ergebnis an.

### Beispiel: Einen Skill erstellen

1. Erstellen Sie einen Ordner: `skills/summarizer/`
2. Erstellen Sie `skills/summarizer/SKILL.md`:

```markdown
---
name: Summarizer
description: Summarizes notes in bullet-point format
---

When asked to summarize, follow these rules:

- Use concise bullet points
- Group related items under headings
- Include key dates and action items
- Keep summaries under 500 words
```

3. Öffnen Sie den Chat, klicken Sie auf **+**, um den Skill "Summarizer" zu aktivieren
4. Bitten Sie die KI, eine Notiz zusammenzufassen — sie wird den Anweisungen des Skills folgen

## Beispiel-Skills

### Stilrichtlinien (Anweisungen + Referenzen)

Ein Skill, der mithilfe eines Referenzdokuments einen konsistenten Schreibstil durchsetzt.

#### Ordnerstruktur

```
skills/
└── writing-style/
    ├── SKILL.md
    └── references/
        └── style-guide.md
```

#### `SKILL.md`

```markdown
---
name: Writing Style
description: Sorgt für einheitlichen Ton und Formatierung bei Blogbeiträgen
---

Du bist ein Schreibassistent. Befolge immer den Stilrichtlinien in den Referenzen.

Beim Überprüfen oder Verfassen von Texten:

1. Verwende die Stimme und den Ton, die in den Stilrichtlinien angegeben sind
2. Befolge die Formatierungsregeln (Überschriften, Listen, Hervorhebungen)
3. Wende die Wortschatzpräferenzen an (bevorzugte/zu vermeidende Wörter)
4. Weise auf Stilverstöße hin, wenn du bestehende Texte überprüfst
```

#### `references/style-guide.md`

```markdown
# Blog-Stilrichtlinien

## Stimme & Ton
- Umgangssprachlich, aber professionell
- Aktive Formulierungen bevorzugt
- Zweite Person („du") für Tutorials, erste Person Plural („wir") für Ankündigungen

## Formatierung
- H2 für Hauptabschnitte, H3 für Unterabschnitte
- Aufzählungslisten für 3+ Elemente verwenden
- Fett für UI-Elemente und Schlüsselbegriffe
- Codeblöcke mit Sprach-Tags

## Wortschatz
- Bevorzugt: „verwenden" statt „nutzen", „beginnen" statt „initiieren", „helfen" statt „ermöglichen"
- Vermeiden: Fachjargon ohne Erklärung, Passivkonstruktionen, Füllwörter („sehr", „wirklich", „einfach")
```

---

### Tagesbericht (Anweisungen + Workflow)

Ein Skill für das tägliche Journaling mit einem Workflow zur Erstellung des heutigen Eintrags.

#### Ordnerstruktur

```
skills/
└── daily-journal/
    ├── SKILL.md
    └── workflows/
        └── create-entry.md
```

#### `SKILL.md`

```markdown
---
name: Daily Journal
description: Tagebuch-Assistent mit Eintragsserstellung
workflows:
  - path: workflows/create-entry.md
    description: Heutigen Tagebucheintrag aus Vorlage erstellen
---

Du bist ein Tagebuch-Assistent. Hilf dem Benutzer, über seinen Tag nachzudenken.

Wenn der Benutzer einen Tagebucheintrag schreiben möchte:

1. Verwende zuerst den Workflow, um die heutige Notizdatei zu erstellen
2. Frage nach Höhepunkten, Herausforderungen und Erkenntnissen
3. Formatiere Einträge mit der Struktur ## Höhepunkte / ## Herausforderungen / ## Erkenntnisse
4. Halte einen warmen, ermutigenden Ton bei
5. Schlage Reflexionsfragen vor, wenn der Benutzer nicht weiterkommt
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: Tagebucheintrag erstellen
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: create
    type: note
    path: "Journal/{{today}}.md"
    content: |
      # {{today}}

      ## Höhepunkte


      ## Herausforderungen


      ## Erkenntnisse


      ## Morgen
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

Verwendung: Aktivieren Sie den Skill und fragen Sie "Erstelle den heutigen Tagebucheintrag" — die KI ruft den Workflow auf, um die Datei zu erstellen, und hilft dann beim Ausfüllen.

---

### Besprechungsnotizen (Anweisungen + Referenzen + Workflow)

Ein vollständiger Skill mit benutzerdefinierten Anweisungen, einer Vorlage als Referenz und einem Workflow zur Erstellung von Besprechungsnotizen.

#### Ordnerstruktur

```
skills/
└── meeting-notes/
    ├── SKILL.md
    ├── references/
    │   └── template.md
    └── workflows/
        └── create-meeting.md
```

#### `SKILL.md`

```markdown
---
name: Meeting Notes
description: Strukturierte Besprechungsnotizen mit Vorlage und automatischer Erstellung
workflows:
  - path: workflows/create-meeting.md
    description: Neue Besprechungsnotiz mit Teilnehmern und Agenda erstellen
---

Du bist ein Besprechungsnotizen-Assistent. Befolge die Vorlage in den Referenzen.

Beim Erstellen von Besprechungsnotizen:

1. Verwende den Workflow, um die Besprechungsnotiz-Datei zu erstellen
2. Befolge die Vorlagenstruktur exakt
3. Erfasse Aufgaben mit Verantwortlichen und Fälligkeitsdaten im Format: `- [ ] [Verantwortlicher] Aufgabe (fällig: YYYY-MM-DD)`
4. Fasse Entscheidungen klar und getrennt von der Diskussion zusammen
5. Biete nach der Besprechung an, Aufgaben als Tasks zu extrahieren
```

#### `references/template.md`

```markdown
# Vorlage für Besprechungsnotizen

## Erforderliche Abschnitte

### Kopfzeile
- **Titel**: Besprechungsthema
- **Datum**: YYYY-MM-DD
- **Teilnehmer**: Liste der Teilnehmer

### Agenda
Nummerierte Liste der Diskussionsthemen.

### Notizen
Diskussionsdetails nach Agendapunkt geordnet. Unterüberschriften verwenden.

### Entscheidungen
Aufzählung der getroffenen Entscheidungen. Jede muss klar und umsetzbar sein.

### Aufgaben
Checkliste mit Verantwortlichem und Fälligkeitsdatum:
- [ ] [Verantwortlicher] Beschreibung (fällig: YYYY-MM-DD)

### Nächste Schritte
Kurze Zusammenfassung der Folgemaßnahmen und des nächsten Besprechungstermins, falls zutreffend.
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: Besprechungsnotiz erstellen
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: gen
    type: command
    prompt: |
      Erstelle einen Dateipfad und initialen Inhalt für eine Besprechungsnotiz.
      Das heutige Datum ist {{today}}.
      Das Besprechungsthema ist: {{topic}}
      Teilnehmer: {{attendees}}

      Gib NUR ein JSON-Objekt zurück:
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...Markdown-Inhalt gemäß der Vorlage..."}

      Verwende die Vorlagenstruktur: Kopfzeile mit Datum/Teilnehmern, Agenda (aus Thema), leere Abschnitte für Notizen/Entscheidungen/Aufgaben/Nächste Schritte.
    saveTo: generated
  - id: parse
    type: json
    source: generated
    saveTo: parsed
  - id: create
    type: note
    path: "{{parsed.path}}"
    content: "{{parsed.content}}"
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "{{parsed.path}}"
```
````

Verwendung: Aktivieren Sie den Skill und sagen Sie "Erstelle Besprechungsnotizen für das Design-Review mit Alice, Bob und Carol" — die KI ruft den Workflow mit Thema/Teilnehmern auf, erstellt eine strukturierte Notiz und öffnet sie.

---

## Einstellungen

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| Skills-Ordner | `skills` | Pfad zum Skills-Ordner in Ihrem Vault |
