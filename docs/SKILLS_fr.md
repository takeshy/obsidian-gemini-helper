# Skills d'Agent

Les Skills d'Agent étendent les capacités de l'IA en fournissant des instructions personnalisées, des documents de référence et des workflows exécutables. Les skills suivent le modèle standard de l'industrie utilisé par des outils comme [OpenAI Codex](https://github.com/openai/codex).

## Skills intégrés

Le plugin inclut trois skills intégrés basés sur [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) qui enseignent à l'IA les formats de fichiers spécifiques à Obsidian. Aucune configuration du coffre requise — ils sont disponibles immédiatement.

| Skill | Description | Par défaut |
|-------|-------------|------------|
| **obsidian-markdown** | Obsidian Flavored Markdown : wikilinks `[[]]`, callouts `> [!note]`, embeds `![[]]`, propriétés (frontmatter), tags, surlignages, commentaires | ON |
| **json-canvas** | Fichiers JSON Canvas (`.canvas`) : nœuds, arêtes, groupes, couleurs, disposition | OFF |
| **obsidian-bases** | Fichiers Obsidian Bases (`.base`) : filtres, formules, vues (tableau/cartes/liste/carte), résumés | OFF |

Les skills intégrés apparaissent dans le menu déroulant du sélecteur de skills avec un badge **built-in**. Activez-les ou désactivez-les comme tout autre skill. Survolez un chip de skill actif pour voir sa description.

Avec **obsidian-markdown** activé (par défaut), l'IA utilisera des wikilinks au lieu de liens Markdown standard, formatera correctement les callouts et suivra les conventions de frontmatter d'Obsidian lors de la création ou de la modification de notes.

## Skills personnalisés

### Structure des dossiers

Les skills sont stockés dans un dossier configurable au sein de votre coffre (par défaut : `skills/`). Chaque skill est un sous-dossier contenant un fichier `SKILL.md` :

```
skills/
├── code-review/
│   ├── SKILL.md            # Définition du skill (obligatoire)
│   ├── references/          # Documents de référence (optionnel)
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # Workflows exécutables (optionnel)
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## Format de SKILL.md

Chaque fichier `SKILL.md` possède un frontmatter YAML pour les métadonnées et un corps en markdown pour les instructions :

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

### Champs du frontmatter

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `name` | Non | Nom d'affichage du skill. Par défaut, le nom du dossier |
| `description` | Non | Courte description affichée dans le sélecteur de skills |
| `workflows` | Non | Liste de références de workflows (voir ci-dessous) |

### Références de workflows

Les workflows déclarés dans le frontmatter sont enregistrés comme outils de Function Calling que l'IA peut invoquer :

```yaml
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
```

Les workflows dans le sous-dossier `workflows/` sont également découverts automatiquement même sans déclaration dans le frontmatter. Les workflows découverts automatiquement utilisent le nom de base du fichier comme description.

## Références

Placez les documents de référence dans un sous-dossier `references/`. Ceux-ci sont automatiquement chargés et inclus dans le contexte de l'IA lorsque le skill est actif. Utilisez les références pour :

- Guides de style et standards de codage
- Modèles et exemples
- Listes de contrôle et procédures
- Connaissances spécifiques au domaine

## Workflows

Les workflows de skills utilisent le même format que le [Constructeur de Workflows](../README_fr.md#constructeur-de-workflows). Placez les fichiers markdown de workflows dans le sous-dossier `workflows/` :

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

Lorsqu'un skill avec des workflows est actif, l'IA reçoit un outil `run_skill_workflow` qu'elle peut appeler pour exécuter ces workflows. Le format de l'ID du workflow est `skillName/workflowName` (ex. `Code Review/workflows_run-lint`).

### Exécution interactive

Les workflows de skills s'exécutent avec des modales interactives (comme dans le panneau Workflow) :

- Une modale de progression affiche le statut en temps réel
- Les invites interactives (`dialog`, `prompt-file`, `prompt-selection`) sont présentées à l'utilisateur
- Les boîtes de dialogue de confirmation nécessitent l'approbation de l'utilisateur
- L'IA reçoit les journaux d'exécution du workflow comme résultat de l'outil

### Renvoyer des valeurs au chat

Lorsque l'IA invoque un workflow de skill via `run_skill_workflow`, **chaque variable dont le nom ne commence pas par `_` est automatiquement renvoyee a l'IA du chat** en tant que partie du resultat de l'outil. Vous n'avez pas besoin d'ajouter un noeud `command` final juste pour "emettre" un resultat — utilisez simplement `saveTo:` avec la valeur que l'IA du chat doit voir.

Un noeud `command` execute un appel LLM distinct *a l'interieur* du workflow et stocke sa sortie dans une variable ; il n'ecrit pas directement dans le chat. Si l'utilisateur a besoin qu'une variable specifique soit rendue telle quelle dans la reponse du chat, mettez cette instruction dans le corps d'instructions de SKILL.md, par exemple :

> Une fois le workflow termine, affichez la valeur de `ogpMarkdown` a l'utilisateur telle quelle, sans commentaire supplementaire.

L'IA cote chat, guidee par ces instructions, inclura la variable dans sa reponse.

### Recuperation en cas d'erreur

Si un workflow de skill echoue pendant un chat, l'appel d'outil defaillant affiche un bouton **Ouvrir le workflow**. Cliquer dessus ouvre le fichier de workflow *et* bascule la vue Gemini sur l'onglet Workflow / skill afin que vous puissiez editer le flux et le relancer. Une ligne d'astuce en dessous pointe egalement vers "Modifier le workflow avec l'IA" → "Referencer l'historique d'execution" pour l'etape defaillante.

## Utilisation des skills dans le Chat

### Configuration

Les skills intégrés fonctionnent directement — aucune configuration nécessaire. Pour ajouter des skills personnalisés, créez un dossier `skills` à la racine de votre coffre.

### Activation des skills

Les skills apparaissent dans la zone de saisie du chat lorsqu'ils sont disponibles :

1. Cliquez sur le bouton **+** à côté de la zone des chips de skills
2. Sélectionnez les skills dans le menu déroulant pour les activer
3. Les skills actifs apparaissent sous forme de chips qui peuvent être retirés en cliquant sur **x**

Lorsque des skills sont actifs :

- Les instructions et références des skills sont injectées dans le prompt système
- Si les skills ont des workflows, l'outil `run_skill_workflow` devient disponible
- Le message de l'assistant indique quels skills ont été utilisés

### Commande Slash

Vous pouvez invoquer un skill directement en tapant `/folder-name` dans l'entrée du chat :

- **`/folder-name`** — Active le skill et envoie immédiatement. L'IA utilise proactivement les instructions et workflows du skill.
- **`/folder-name votre message`** — Active le skill et envoie « votre message » avec.
- L'autocomplétion affiche les skills disponibles lorsque vous tapez `/`. La sélection envoie immédiatement.

Le nom du dossier (pas le nom d'affichage du skill) est utilisé comme commande — par exemple, un skill dans `skills/weekly-report/` est invoqué avec `/weekly-report`.

### Exemple : Créer un skill

1. Créez un dossier : `skills/summarizer/`
2. Créez `skills/summarizer/SKILL.md` :

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

3. Ouvrez le chat, cliquez sur **+** pour activer le skill "Summarizer"
4. Demandez à l'IA de résumer une note — elle suivra les instructions du skill

## Exemples de Skills

### Guide de Style d'Écriture (Instructions + Références)

Un skill qui impose un style d'écriture cohérent à l'aide d'un document de référence.

#### Structure des dossiers

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
description: Impose un ton et un formatage cohérents pour les articles de blog
---

Vous êtes un assistant de rédaction. Suivez toujours le guide de style dans les références.

Lors de la révision ou de la rédaction de texte :

1. Utilisez la voix et le ton spécifiés dans le guide de style
2. Suivez les règles de formatage (titres, listes, emphase)
3. Appliquez les préférences de vocabulaire (mots préférés/à éviter)
4. Signalez toute violation de style lors de la révision de texte existant
```

#### `references/style-guide.md`

```markdown
# Guide de Style du Blog

## Voix et Ton
- Conversationnel mais professionnel
- Voix active préférée
- Deuxième personne (« vous ») pour les tutoriels, première personne du pluriel (« nous ») pour les annonces

## Formatage
- H2 pour les sections principales, H3 pour les sous-sections
- Utiliser des listes à puces pour 3+ éléments
- Gras pour les éléments d'interface et les termes clés
- Blocs de code avec balises de langage

## Vocabulaire
- Préférer : « utiliser » plutôt que « employer », « commencer » plutôt que « initier », « aider » plutôt que « faciliter »
- Éviter : jargon sans explication, constructions passives, mots de remplissage (« très », « vraiment », « juste »)
```

---

### Journal Quotidien (Instructions + Workflow)

Un skill d'aide à la rédaction d'un journal avec un workflow pour créer l'entrée du jour.

#### Structure des dossiers

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
description: Assistant de journal quotidien avec création d'entrées
workflows:
  - path: workflows/create-entry.md
    description: Créer l'entrée de journal d'aujourd'hui à partir du modèle
---

Vous êtes un assistant de journal. Aidez l'utilisateur à réfléchir sur sa journée.

Lorsque l'utilisateur demande à écrire une entrée de journal :

1. Utilisez d'abord le workflow pour créer le fichier de notes du jour
2. Posez des questions sur les moments forts, les défis et les apprentissages
3. Formatez les entrées avec la structure ## Moments Forts / ## Défis / ## Apprentissages
4. Maintenez un ton chaleureux et encourageant
5. Suggérez des questions de réflexion si l'utilisateur semble bloqué
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: Créer une Entrée de Journal
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: create
    type: note
    path: "Journal/{{today}}.md"
    content: |
      # {{today}}

      ## Moments Forts


      ## Défis


      ## Apprentissages


      ## Demain
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

Utilisation : Activez le skill, puis demandez « Crée l'entrée de journal d'aujourd'hui » — l'IA appelle le workflow pour créer le fichier, puis vous aide à le remplir.

---

### Notes de Réunion (Instructions + Références + Workflow)

Un skill complet combinant des instructions personnalisées, un modèle de référence et un workflow pour créer des notes de réunion.

#### Structure des dossiers

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
description: Prise de notes de réunion structurée avec modèle et création automatique
workflows:
  - path: workflows/create-meeting.md
    description: Créer une nouvelle note de réunion avec participants et ordre du jour
---

Vous êtes un assistant de notes de réunion. Suivez le modèle dans les références.

Lors de l'aide à la prise de notes de réunion :

1. Utilisez le workflow pour créer le fichier de notes de réunion
2. Suivez exactement la structure du modèle
3. Capturez les actions à mener avec les responsables et les échéances au format : `- [ ] [Responsable] Action à mener (échéance : YYYY-MM-DD)`
4. Résumez les décisions de manière claire et séparée de la discussion
5. Après la réunion, proposez d'extraire les actions à mener sous forme de tâches
```

#### `references/template.md`

```markdown
# Modèle de Notes de Réunion

## Sections Requises

### En-tête
- **Titre** : Sujet de la réunion
- **Date** : YYYY-MM-DD
- **Participants** : Liste des participants

### Ordre du Jour
Liste numérotée des sujets de discussion.

### Notes
Détails de la discussion organisés par point de l'ordre du jour. Utiliser des sous-titres.

### Décisions
Liste à puces des décisions prises. Chacune doit être claire et actionnable.

### Actions à Mener
Liste de cases à cocher avec responsable et échéance :
- [ ] [Responsable] Description (échéance : YYYY-MM-DD)

### Prochaines Étapes
Bref résumé des suivis et date de la prochaine réunion si applicable.
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: Créer une Note de Réunion
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: gen
    type: command
    prompt: |
      Génère un chemin de fichier et un contenu initial pour une note de réunion.
      La date d'aujourd'hui est {{today}}.
      Le sujet de la réunion est : {{topic}}
      Participants : {{attendees}}

      Retourne UNIQUEMENT un objet JSON :
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...contenu markdown suivant le modèle..."}

      Utilise la structure du modèle : En-tête avec date/participants, Ordre du jour (à partir du sujet), sections vides Notes/Décisions/Actions à Mener/Prochaines Étapes.
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

Utilisation : Activez le skill, puis dites « Crée les notes de réunion pour la revue de design avec Alice, Bob et Carol » — l'IA appelle le workflow avec le sujet/participants, crée une note structurée et l'ouvre.

---
