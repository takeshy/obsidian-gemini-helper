# Skill dell'Agente

Gli Skill dell'Agente estendono le capacita dell'IA fornendo istruzioni personalizzate, materiali di riferimento e workflow eseguibili. Gli skill seguono il modello standard del settore utilizzato da strumenti come [OpenAI Codex](https://github.com/openai/codex).

## Struttura delle Cartelle

Gli skill sono memorizzati in una cartella configurabile all'interno del tuo vault (predefinita: `skills/`). Ogni skill e una sottocartella contenente un file `SKILL.md`:

```
skills/
├── code-review/
│   ├── SKILL.md            # Definizione dello skill (obbligatorio)
│   ├── references/          # Documenti di riferimento (opzionale)
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # Workflow eseguibili (opzionale)
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## Formato di SKILL.md

Ogni file `SKILL.md` ha un frontmatter YAML per i metadati e un corpo markdown per le istruzioni:

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

### Campi del Frontmatter

| Campo | Obbligatorio | Descrizione |
|-------|-------------|-------------|
| `name` | No | Nome visualizzato per lo skill. Predefinito: nome della cartella |
| `description` | No | Breve descrizione mostrata nel selettore degli skill |
| `workflows` | No | Lista di riferimenti ai workflow (vedi sotto) |

### Riferimenti ai Workflow

I workflow dichiarati nel frontmatter vengono registrati come strumenti di Function Calling che l'IA puo invocare:

```yaml
workflows:
  - path: workflows/run-lint.md
    name: lint              # ID personalizzato opzionale (predefinito: ID basato sul percorso)
    description: Run linting on the current note
```

I workflow nella sottocartella `workflows/` vengono anche scoperti automaticamente anche senza dichiarazioni nel frontmatter. I workflow scoperti automaticamente usano il nome base del file come descrizione.

## Riferimenti

Posiziona i documenti di riferimento in una sottocartella `references/`. Questi vengono caricati automaticamente e inclusi nel contesto dell'IA quando lo skill e attivo. Usa i riferimenti per:

- Guide di stile e standard di codifica
- Template ed esempi
- Checklist e procedure
- Conoscenze specifiche del dominio

## Workflow

I workflow degli skill usano lo stesso formato del [Workflow Builder](../README_it.md#workflow-builder). Posiziona i file markdown dei workflow nella sottocartella `workflows/`:

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

Quando uno skill con workflow e attivo, l'IA riceve uno strumento `run_skill_workflow` che puo chiamare per eseguire questi workflow. Il formato dell'ID del workflow e `skillName/workflowName` (es. `Code Review/workflows_run-lint`).

### Esecuzione Interattiva

I workflow degli skill vengono eseguiti con modali interattive (come nel pannello Workflow):

- Viene mostrata una modale di progresso con lo stato in tempo reale
- I prompt interattivi (`dialog`, `prompt-file`, `prompt-selection`) vengono mostrati all'utente
- I dialoghi di conferma richiedono l'approvazione dell'utente
- L'IA riceve i log di esecuzione del workflow come risultato dello strumento

## Utilizzo degli Skill nella Chat

### Configurazione

1. Apri le impostazioni del plugin
2. Trova la sezione **Skill dell'agente**
3. Imposta il percorso della cartella degli skill (predefinito: `skills`)

### Attivazione degli Skill

Gli skill appaiono nell'area di input della chat quando disponibili:

1. Clicca il pulsante **+** accanto all'area dei chip degli skill
2. Seleziona gli skill dal menu a tendina per attivarli
3. Gli skill attivi appaiono come chip che possono essere rimossi cliccando **x**

Quando gli skill sono attivi:

- Le istruzioni e i riferimenti dello skill vengono iniettati nel prompt di sistema
- Se gli skill hanno workflow, lo strumento `run_skill_workflow` diventa disponibile
- Il messaggio dell'assistente mostra quali skill sono stati utilizzati

### Comando Slash

Puoi invocare uno skill direttamente digitando `/folder-name` nell'input della chat:

- **`/folder-name`** — Attiva lo skill e invia immediatamente. L'IA utilizza proattivamente le istruzioni e i workflow dello skill.
- **`/folder-name il tuo messaggio`** — Attiva lo skill e invia "il tuo messaggio" insieme.
- L'autocompletamento mostra gli skill disponibili mentre digiti `/`. La selezione invia immediatamente.

Il nome della cartella (non il nome visualizzato dello skill) viene usato come comando — ad esempio, uno skill in `skills/weekly-report/` viene invocato con `/weekly-report`.

### Supporto Modalità CLI

Gli skill funzionano anche con i backend CLI (Gemini CLI, Claude CLI, Codex CLI). Poiché i provider CLI non supportano il Function Calling, i workflow degli skill utilizzano una convenzione testuale: l'IA emette un marcatore `[RUN_WORKFLOW: workflowId]`, e il plugin esegue automaticamente il workflow e mostra il risultato.

### Esempio: Creare uno Skill

1. Crea una cartella: `skills/summarizer/`
2. Crea `skills/summarizer/SKILL.md`:

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

3. Apri la chat, clicca **+** per attivare lo skill "Summarizer"
4. Chiedi all'IA di riassumere una nota — seguira le istruzioni dello skill

## Esempi di Skill

### Guida allo Stile di Scrittura (Istruzioni + Riferimenti)

Uno skill che impone uno stile di scrittura coerente utilizzando un documento di riferimento.

#### Struttura delle cartelle

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
description: Impone tono e formattazione coerenti per i post del blog
---

Sei un assistente alla scrittura. Segui sempre la guida di stile nei riferimenti.

Quando revisioni o scrivi testo:

1. Usa la voce e il tono specificati nella guida di stile
2. Segui le regole di formattazione (titoli, elenchi, enfasi)
3. Applica le preferenze di vocabolario (parole preferite/da evitare)
4. Segnala eventuali violazioni di stile nella revisione del testo esistente
```

#### `references/style-guide.md`

```markdown
# Guida di Stile del Blog

## Voce e Tono
- Colloquiale ma professionale
- Preferire la forma attiva
- Seconda persona ("tu") per i tutorial, prima persona plurale ("noi") per gli annunci

## Formattazione
- H2 per le sezioni principali, H3 per le sottosezioni
- Usare elenchi puntati per 3 o piu elementi
- Grassetto per elementi dell'interfaccia e termini chiave
- Blocchi di codice con tag del linguaggio

## Vocabolario
- Preferire: "usare" a "utilizzare", "iniziare" a "avviare", "aiutare" a "facilitare"
- Evitare: gergo senza spiegazione, costruzioni passive, parole riempitive ("molto", "davvero", "proprio")
```

---

### Diario Giornaliero (Istruzioni + Workflow)

Uno skill per il journaling quotidiano con un workflow per creare la voce del giorno.

#### Struttura delle cartelle

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
description: Assistente per il diario giornaliero con creazione delle voci
workflows:
  - path: workflows/create-entry.md
    description: Crea la voce del diario di oggi dal template
---

Sei un assistente per il journaling. Aiuta l'utente a riflettere sulla sua giornata.

Quando l'utente chiede di scrivere una voce del diario:

1. Usa il workflow per creare prima il file della nota di oggi
2. Chiedi informazioni su momenti salienti, sfide e insegnamenti
3. Formatta le voci con la struttura ## Momenti Salienti / ## Sfide / ## Insegnamenti
4. Mantieni un tono caldo e incoraggiante
5. Suggerisci spunti di riflessione se l'utente sembra bloccato
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: Crea Voce del Diario
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

      ## Momenti Salienti


      ## Sfide


      ## Insegnamenti


      ## Domani
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

Utilizzo: Attiva lo skill e chiedi "Crea la voce del diario di oggi" — l'IA esegue il workflow per creare il file, poi ti aiuta a compilarlo.

---

### Note di Riunione (Istruzioni + Riferimenti + Workflow)

Uno skill completo che combina istruzioni personalizzate, un template di riferimento e un workflow per creare note di riunione.

#### Struttura delle cartelle

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
description: Presa di appunti strutturata per riunioni con template e creazione automatica
workflows:
  - path: workflows/create-meeting.md
    description: Crea una nuova nota di riunione con partecipanti e ordine del giorno
---

Sei un assistente per le note di riunione. Segui il template nei riferimenti.

Quando aiuti con le note di riunione:

1. Usa il workflow per creare il file della nota di riunione
2. Segui esattamente la struttura del template
3. Registra le azioni da intraprendere con responsabili e scadenze nel formato: `- [ ] [Responsabile] Azione da intraprendere (scadenza: AAAA-MM-GG)`
4. Riassumi le decisioni in modo chiaro e separato dalla discussione
5. Dopo la riunione, proponi di estrarre le azioni da intraprendere come attivita
```

#### `references/template.md`

```markdown
# Template Nota di Riunione

## Sezioni Obbligatorie

### Intestazione
- **Titolo**: Argomento della riunione
- **Data**: AAAA-MM-GG
- **Partecipanti**: Lista dei partecipanti

### Ordine del Giorno
Lista numerata degli argomenti di discussione.

### Note
Dettagli della discussione organizzati per punto dell'ordine del giorno. Usare sotto-titoli.

### Decisioni
Elenco puntato delle decisioni prese. Ogni decisione deve essere chiara e attuabile.

### Azioni da Intraprendere
Lista con caselle di spunta con responsabile e scadenza:
- [ ] [Responsabile] Descrizione (scadenza: AAAA-MM-GG)

### Prossimi Passi
Breve riepilogo dei follow-up e data della prossima riunione se applicabile.
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: Crea Nota di Riunione
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: gen
    type: command
    prompt: |
      Genera il percorso del file e il contenuto iniziale della nota di riunione.
      La data di oggi e {{today}}.
      L'argomento della riunione e: {{topic}}
      Partecipanti: {{attendees}}

      Restituisci SOLO un oggetto JSON:
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...contenuto markdown seguendo il template..."}

      Usa la struttura del template: Intestazione con data/partecipanti, Ordine del Giorno (dall'argomento), sezioni vuote Note/Decisioni/Azioni da Intraprendere/Prossimi Passi.
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

Utilizzo: Attiva lo skill e di' "Crea le note della riunione per la revisione del design con Alice, Bob e Carol" — l'IA esegue il workflow con argomento/partecipanti, crea una nota strutturata e la apre.

---

## Impostazioni

| Impostazione | Predefinito | Descrizione |
|-------------|-------------|-------------|
| Cartella degli skill | `skills` | Percorso della cartella degli skill nel tuo vault |
