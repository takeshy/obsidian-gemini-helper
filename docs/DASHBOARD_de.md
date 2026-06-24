# Dashboard

Erstellen Sie eine persönliche **Start-/Übersichtsseite** aus einem responsiven Raster von Widgets. Ein Dashboard ist eine `.dashboard`-Datei, die **Bases-Ansichten**, **Notizen**, **Webseiten** und **Workflow-Ausgaben** in einem per Drag-and-Drop verschieb- und skalierbaren Raster anordnet. Öffnen Sie es wie jede Notiz, um ein bearbeitbares Live-Board zu erhalten.

![Dashboard](images/dashboard.png)

---

## Dashboard vs. Canvas

Obsidians **Canvas** und ein Dashboard sehen ähnlich aus, lösen aber unterschiedliche Probleme:

| | Dashboard | Canvas |
|---|-----------|--------|
| **Inhalt** | **Live** — Bases-Ansichten, Workflow-Ausgaben und Notizen aktualisieren sich selbst (abfragegesteuert) | **Statisch** — Karten sind von Hand platzierte Momentaufnahmen |
| **Layout** | Responsives Raster (12 Spalten; bricht auf schmalen Bildschirmen in eine einzelne Spalte um) | Frei gestaltbare unendliche Fläche mit absoluten Positionen |
| **Zweck** | Eine strukturierte **Start-/Übersichtsseite**, die Sie öffnen, um den Status zu prüfen | Ein Raum zum **Denken** — Ideen anordnen und mit Pfeilen verbinden |
| **KI** | Aus dem Chat erstellt (der `dashboard`-Skill baut die Datei und ihre zugrunde liegenden `.base`-Daten) | Manuelle Platzierung |
| **Anzeige** | Ein schreibgeschützter Anzeigemodus, der nicht gestört werden kann | Immer bearbeitbar |

Kurz gesagt: Verwenden Sie ein **Dashboard** für eine aktuelle Übersicht auf einen Blick (Aufgaben, generierte Zusammenfassungen, eingebettete Seiten); verwenden Sie ein **Canvas** für freies, räumliches Denken und Beziehungen. Die wesentlichen Abwägungen sind **dynamisch vs. statisch** und **responsives Raster vs. freie Platzierung**.

---

## Ein Dashboard erstellen

Es gibt zwei Möglichkeiten, ein Dashboard zu erstellen:

1. **Befehl** — führen Sie **„Gemini Helper: Dashboard erstellen"** über die Befehlspalette aus. Dadurch wird eine neue Datei im Ordner `Dashboards/` erstellt (benannt `Dashboard`, `Dashboard 2`, …) und geöffnet.
2. **Die KI fragen** — das Plugin enthält einen integrierten Agent-Skill **`dashboard`**. Aktivieren Sie ihn im Chat und beschreiben Sie, was Sie möchten (*„eine Startseite mit meinen aktiven Aufgaben, einer Willkommensnotiz und dem heutigen Wetter"*). Die KI erstellt die `.dashboard`-Datei — und alle zugrunde liegenden `.base`-Dateien — für Sie.

Dashboards werden als einfache `.dashboard`-Dateien in Ihrem Vault gespeichert, sodass sie wie jede andere Notiz synchronisiert und versioniert werden.

---

## Bearbeitungsmodus

Jedes Dashboard wird im **Anzeigemodus** geöffnet. Wechseln Sie über die Symbolleiste:

- **Bearbeiten** — Bearbeitungsmodus aufrufen: Widgets ziehen, um sie zu verschieben, die rechte untere Ecke eines Widgets ziehen, um die Größe zu ändern, auf das **Zahnrad** klicken, um ein Widget zu konfigurieren, und auf den **Papierkorb**, um es zu löschen.
- **+ Widget hinzufügen** — die Widget-Palette öffnen (nur im Bearbeitungsmodus).
- **Rückgängig / Wiederholen** — durch die in dieser Sitzung vorgenommenen Layout-Änderungen blättern.
- **Fertig** — in den Anzeigemodus zurückkehren.

> Alle Änderungen werden **automatisch gespeichert** — es gibt keine separate Speichern-Schaltfläche.

---

## Widget-Typen

Klicken Sie im Bearbeitungsmodus auf **+ Widget hinzufügen**, um einen Widget-Typ auszuwählen:

![Widget-Palette hinzufügen](images/dashboard_widgets.png)

### Base — eine Bases-Ansicht einbetten

Rendert eine benannte Ansicht einer `.base`-Datei über die **native Bases-UI** von Obsidian (Tabelle / Karten / Liste / Karte). Dies ist das primäre Datenwidget — verwenden Sie es für jede Listen-, Tabellen- oder Kartenansicht von Notizen, anstatt diese neu zu implementieren.

![Base-Widget-Einstellungen](images/dashboard_base.png)

| Einstellung | Beschreibung |
|---------|-------------|
| **Base-Datei** | Vault-Pfad zur `.base`-Datei |
| **Ansicht** | Der zu rendernde Ansichtsname; leer lassen, um die erste Ansicht der Base zu verwenden |
| **Mit KI erstellen** | Eine neue `.base`-Datei erstellen (oder die ausgewählte bearbeiten), ohne das Panel zu verlassen |

Dieselbe `.base`-Datei kann von mehreren Base-Widgets referenziert werden — zum Beispiel ein Widget pro Ansicht (Active / Done / Backlog).

### Markdown — eine Notiz einbetten

Rendert eine bestehende Markdown-Notiz inline als schreibgeschützte Einbettung (mit einem Link zum Öffnen der vollständigen Notiz).

![Markdown-Widget-Einstellungen](images/dashboard_markdown.png)

| Einstellung | Beschreibung |
|---------|-------------|
| **Markdown-Notiz** | Vault-Pfad zur einzubettenden Notiz (durchsuchbare Auswahl) |

### Web Embed — eine Webseite einbetten

Bettet eine Webseite in einem iframe ein.

![Web-Embed-Widget-Einstellungen](images/dashboard_web.png)

| Einstellung | Beschreibung |
|---------|-------------|
| **URL** | Die einzubettende Seite |

> [!NOTE]
> Einige Websites senden `X-Frame-Options`- / `Content-Security-Policy`-Header, die das Einbetten blockieren, und erscheinen leer.

### Workflow — Workflow-Ausgabe rendern

Führt einen bestehenden [Workflow](WORKFLOW_NODES_de.md) **headless** aus und rendert seine Ausgabe als Markdown oder HTML. So können Sie dynamische, generierte Inhalte (Zusammenfassungen, Berichte) auf einem Dashboard platzieren.

![Workflow-Widget-Einstellungen](images/dashboard_workflow.png)

| Einstellung | Beschreibung |
|---------|-------------|
| **Ausgabeformat** | `Markdown` oder `HTML` (HTML wird in einem sandboxed iframe gerendert) |
| **Workflow** | Die auszuführende Workflow-Notiz |
| **Mit KI erstellen** | Einen neuen Workflow für dieses Widget erstellen (oder den ausgewählten bearbeiten) |
| **Ausgabevariable** | Die Workflow-Variable, die die Ausgabezeichenfolge enthält (Standard `result`) |
| **Ausführen** | Den Workflow jetzt ausführen und das Ergebnis zwischenspeichern |
| **Aktualisierungsintervall (Minuten)** | `0` = nur manuell; andernfalls einmal beim Öffnen ausführen, wenn das zwischengespeicherte Ergebnis älter ist |

> [!IMPORTANT]
> **Workflow-Widgets rendern aus einem Cache, nicht live.** Um zu vermeiden, dass schwere Workflows bei jedem Öffnen des Boards erneut ausgeführt werden, liest der Render-Pfad **nur** aus einem zwischengespeicherten Ergebnis. Eine Ausführung erfolgt nur, wenn Sie:
> - auf **Ausführen** klicken (in der Widget-Kopfzeile oder im Einstellungs-Panel), oder
> - das Dashboard öffnen und das zwischengespeicherte Ergebnis älter als das Aktualisierungsintervall ist.
>
> Die Ergebnisse werden in einer versteckten **Sidecar-Datei** neben dem Dashboard gespeichert, sodass die Ausgabe ein erneutes Öffnen übersteht, ohne die `.dashboard`-Datei aufzublähen. Der Workflow muss seine Markdown-/HTML-Ausgabe in einer Zeichenfolgenvariable speichern (Standard `result`) — Karten-/Tabellenausgaben werden nicht unterstützt. Da er unbeaufsichtigt läuft, darf der Workflow keine interaktiven Nodes (`prompt-*`, `dialog`) verwenden.

### Kanban — Karten ziehen, um den Status zu ändern

Rendert Notizen, die einem **Tag**- und/oder **Ordner**-Filter entsprechen, als Karten, gruppiert in Spalten nach einer Frontmatter-**Status-Eigenschaft**. Ziehen Sie eine Karte in eine andere Spalte, um den Status dieser Notiz zu aktualisieren (geschrieben über `processFrontMatter`). Klicken Sie auf eine Karte, um ihre Notiz in einem Dialogfenster anzuzeigen; das Öffnen-Symbol des Dialogs öffnet die Notiz in einem neuen Tab. Das Board ist im **Anzeigemodus** interaktiv — Sie müssen den Bearbeitungsmodus nicht aktivieren, um Karten zu ziehen.

![Kanban-Board](images/dashboard_kanban.png)

Die Kopfzeile des Boards zeigt einen optionalen **Titel** (praktisch, wenn ein Dashboard mehrere Boards enthält) und eine Schaltfläche **Neu**. Neu öffnet ein kleines Dialogfenster, um den Kartentitel einzugeben und ihre Spalte auszuwählen, und erstellt dann eine Notiz, die bereits den Filtern dieses Boards entspricht — im konfigurierten Ordner abgelegt, mit dem konfigurierten Tag versehen und auf den Status der gewählten Spalte gesetzt. Die neue Karte erscheint auf dem Board (Sie bleiben im Dashboard); klicken Sie sie an, wenn Sie die Notiz öffnen möchten.

Konfigurieren Sie das Board über die Widget-Einstellungen im Bearbeitungsmodus:

![Kanban-Einstellungen](images/dashboard_kanban_edit.png)

| Einstellung | Beschreibung |
|---------|-------------|
| **Board-Titel** | Wird in der Board-Kopfzeile angezeigt. Nützlich, wenn mehrere Boards ein Dashboard teilen. |
| **Tag-Filter** | Nur Notizen mit diesem Tag anzeigen (ohne `#`). Leer = alle Tags. |
| **Ordner-Filter** | Nur Notizen anzeigen, deren Pfad mit diesem Präfix beginnt. Leer = gesamter Vault. |
| **Status-Eigenschaft** | Frontmatter-Eigenschaft, die den Status der Karte enthält (Standard `status`). |
| **Titel-Eigenschaft** | Frontmatter-Eigenschaft, die als Kartentitel angezeigt wird. Leer = Dateiname. |
| **Spalten** | Geordnete Liste von Statuswerten. Jede Spalte hat einen **Wert** (gegen die Eigenschaft abgeglichen) und eine **Bezeichnung** (als Kopfzeile angezeigt). |
| **Anzeigefelder** | Geordnete Liste von Frontmatter-Eigenschaften, die auf jeder Karte unter dem Titel angezeigt werden (z. B. `priority`, `due`). Jede wird als `name: value` angezeigt; leere Werte werden übersprungen, Listenwerte mit Kommas verbunden. |
| **Spalte für nicht zugeordnete Karten anzeigen** | Wenn aktiviert, erscheinen Karten, deren Status zu keiner Spalte passt, in einer zusätzlichen Spalte „Nicht angegeben" (Standard ein). |

Unbekannte Widget-Typen (z. B. aus einer neueren Plugin-Version) werden **beim Speichern beibehalten** und als Platzhalter gerendert, sodass das Bearbeiten eines unbekannten Dashboards niemals Daten verliert.

---

## Responsives Layout

Das Raster hat zwei Breakpoints, die je nach Containerbreite umgeschaltet werden:

| Breakpoint | Wann | Layout |
|------------|------|--------|
| **`lg`** (breit) | ≥ 768px | Das im Bearbeitungsmodus angeordnete Layout (Standard 12 Spalten) |
| **`sm`** (schmal) | < 768px | Widgets werden in eine **einzelne Spalte voller Breite** umgebrochen, von oben nach unten gestapelt |

Standardmäßig wird das `sm`-Layout **automatisch** aus dem breiten Layout abgeleitet (nach vertikaler Position geordnet). Wenn Sie Widgets auf einem schmalen Bildschirm verschieben, werden diese expliziten `sm`-Positionen beibehalten und die übrigen Widgets füllen die Lücken um sie herum.

---

## Widgets mit KI erstellen

Sowohl das **Base**- als auch das **Workflow**-Widget haben im Einstellungs-Panel eine Schaltfläche **Mit KI erstellen**:

- Für ein **Base**-Widget öffnet sie den KI-Erstellungsdialog für eine `.base`-Datei. Die KI kann Ihre Notizen mit schreibgeschützten Tools (Lesen, Suchen, Auflisten) prüfen, um vor dem Erstellen die passenden Frontmatter-Eigenschaften zu finden — so funktioniert z. B. eine Kartenansicht mit Titelbildern, ohne dass Sie die Eigenschaft nennen müssen. Wenn bereits eine Base ausgewählt ist, wird die Schaltfläche zu **Mit KI bearbeiten**: Sie zeigt ein **Diff** des vorgeschlagenen `.base`-Inhalts gegenüber dem aktuellen sowie ein Feld für **zusätzliche Anweisungen**, um ihn vor dem **Anwenden** zu verfeinern.
- Für ein **Workflow**-Widget generiert (oder bearbeitet) sie einen auf das Widget zugeschnittenen Workflow — der KI wird mitgeteilt, eine einzelne Markdown-/HTML-Zeichenfolge in der Ausgabevariable zu erzeugen und interaktive Nodes zu vermeiden, sodass das Ergebnis headless gerendert wird. Nach der Generierung wird das Widget **automatisch ausgeführt und aktualisiert**.

Sie können auch ein ganzes Dashboard aus dem Chat mit dem integrierten Agent-Skill **`dashboard`** erstellen, der das `.dashboard`-Schema und die Bases-Erstellungsreferenz kennt.

---

## Das `.dashboard`-Dateiformat

Eine `.dashboard`-Datei ist YAML. Normalerweise bearbeiten Sie sie nie von Hand (der visuelle Editor und die KI verwalten sie), aber das Schema ist hier als Referenz und zur Round-Trip-Sicherheit dokumentiert.

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

- **`layout.lg`** ist die Position auf dem breiten (≥768px) Raster. `x`/`y` sind die 0-basierte obere linke Zelle; `w`/`h` sind Breite/Höhe in Rasterzellen.
- **`layout.sm`** ist die Position auf schmalen Bildschirmen. Lassen Sie es weg, um es automatisch in voller Rasterbreite zu stapeln.
- Platzieren Sie Widgets so, dass sie sich nicht überlappen; stapeln Sie vertikal durch Erhöhen von `y`.

### `config` pro Widget

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
  displayFields: [priority, due]       # frontmatter properties shown on each card
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
```

### Vollständiges Beispiel

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

## Tipps & Hinweise

- **Erstellen Sie zuerst die Daten.** Erstellen Sie für ein Base-Widget die `.base`-Datei (und ihre Ansichten), bevor Sie ein Widget darauf richten. Der KI-Dashboard-Skill erledigt dies in einem Durchgang für Sie.
- **Nach Ansicht gruppieren.** Verwenden Sie eine `.base` über mehrere Base-Widgets hinweg (Active / Done / Backlog), anstatt Daten zu duplizieren.
- **Halten Sie Workflow-Widgets günstig.** Sie speichern Ergebnisse zwischen; legen Sie ein sinnvolles **Aktualisierungsintervall** fest, anstatt sie bei jedem Öffnen auszuführen, und speichern Sie die Ausgabe in `result`.
- **Nur Desktop.** Dashboards laufen (wie der Rest des Plugins) auf Obsidian Desktop.
- **Dateien liegen in Ihrem Vault.** Dashboards werden unter `Dashboards/` als `.dashboard`-Dateien gespeichert und mit Ihren Notizen synchronisiert/versioniert; der Workflow-Cache pro Dashboard liegt in einer versteckten Sidecar-Datei neben jedem.

> Siehe auch: [Workflow-Nodes](WORKFLOW_NODES_de.md) · [Agent-Skills](SKILLS_de.md)
