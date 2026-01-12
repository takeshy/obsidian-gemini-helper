# Gemini Helper pour Obsidian

Assistant IA **gratuit et open-source** pour Obsidian avec **Chat**, **Automatisation de Workflows** et **RAG** propulsé par Google Gemini.

> **Ce plugin est entièrement gratuit.** Vous avez uniquement besoin d'une clé API Google Gemini (gratuite ou payante) depuis [ai.google.dev](https://ai.google.dev), ou utilisez des outils CLI : [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code), ou [Codex CLI](https://github.com/openai/codex).

## Points Forts

- **Chat IA** - Réponses en streaming, pièces jointes, opérations sur le coffre, commandes slash
- **Constructeur de Workflows** - Automatisez des tâches multi-étapes avec l'éditeur visuel de nœuds et 22 types de nœuds
- **Historique d'Édition** - Suivez et restaurez les modifications faites par l'IA avec vue des différences
- **RAG** - Génération Augmentée par Récupération pour une recherche intelligente dans votre coffre
- **Recherche Web** - Accédez à des informations actualisées via Google Search
- **Génération d'Images** - Créez des images avec les modèles d'images Gemini

![Génération d'images dans le chat](chat_image.png)

## Clé API / Options CLI

Ce plugin nécessite une clé API Google Gemini ou un outil CLI. Vous pouvez choisir entre :

| Fonctionnalité | Clé API Gratuite | Clé API Payante | CLI |
|----------------|------------------|-----------------|-----|
| Chat basique | ✅ | ✅ | ✅ |
| Opérations sur le coffre | ✅ | ✅ | Lecture/Recherche uniquement |
| Recherche Web | ✅ | ✅ | ❌ |
| RAG | ✅ (limité) | ✅ | ❌ |
| Workflow | ✅ | ✅ | ✅ |
| Génération d'images | ❌ | ✅ | ❌ |
| Modèles | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| Coût | **Gratuit** | Paiement à l'usage | **Gratuit** |

> [!TIP]
> Les **options CLI** vous permettent d'utiliser les modèles phares avec juste un compte - aucune clé API requise !
> - **Gemini CLI** : Installez [Gemini CLI](https://github.com/google-gemini/gemini-cli), lancez `gemini` et authentifiez-vous avec `/auth`
> - **Claude CLI** : Installez [Claude Code](https://github.com/anthropics/claude-code) (`npm install -g @anthropic-ai/claude-code`), lancez `claude` et authentifiez-vous
> - **Codex CLI** : Installez [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`), lancez `codex` et authentifiez-vous

### Conseils pour la Clé API Gratuite

- Les **limites de débit** sont par modèle et se réinitialisent quotidiennement. Changez de modèle pour continuer à travailler.
- La **synchronisation RAG** est limitée. Lancez "Sync Vault" quotidiennement - les fichiers déjà uploadés sont ignorés.
- Les **modèles Gemma** et **Gemini CLI** ne supportent pas les opérations sur le coffre dans le Chat, mais les **Workflows peuvent toujours lire/écrire des notes** en utilisant les types de nœuds `note`, `note-read` et autres. Les variables `{content}` et `{selection}` fonctionnent également.

---

# Chat IA

La fonctionnalité Chat IA fournit une interface de conversation interactive avec Google Gemini, intégrée à votre coffre Obsidian.

![Interface de Chat](chat.png)

## Commandes Slash

Créez des modèles de prompts réutilisables déclenchés par `/` :

- Définissez des modèles avec `{selection}` (texte sélectionné) et `{content}` (note active)
- Modèle et recherche optionnels personnalisables par commande
- Tapez `/` pour voir les commandes disponibles

**Par défaut :** `/infographic` - Convertit le contenu en infographie HTML

![Exemple d'Infographie](chat_infographic.png)

## Mentions @

Référencez des fichiers et variables en tapant `@` :

- `{selection}` - Texte sélectionné
- `{content}` - Contenu de la note active
- N'importe quel fichier du coffre - Parcourez et insérez (chemin uniquement ; l'IA lit le contenu via les outils)

> [!NOTE]
> Les mentions @ de fichiers du coffre insèrent uniquement le chemin du fichier - l'IA lit le contenu via les outils. Cela ne fonctionne pas avec les modèles Gemma (pas de support des outils du coffre). Gemini CLI peut lire les fichiers via le shell, mais le format de réponse peut différer.

## Pièces Jointes

Joignez des fichiers directement : Images (PNG, JPEG, GIF, WebP), PDFs, Fichiers texte

## Appel de Fonctions (Opérations sur le Coffre)

L'IA peut interagir avec votre coffre en utilisant ces outils :

| Outil | Description |
|-------|-------------|
| `read_note` | Lire le contenu d'une note |
| `create_note` | Créer de nouvelles notes |
| `propose_edit` | Éditer avec dialogue de confirmation |
| `propose_delete` | Supprimer avec dialogue de confirmation |
| `bulk_propose_edit` | Édition en masse de plusieurs fichiers avec dialogue de sélection |
| `bulk_propose_delete` | Suppression en masse de plusieurs fichiers avec dialogue de sélection |
| `search_notes` | Rechercher dans le coffre par nom ou contenu |
| `list_notes` | Lister les notes dans un dossier |
| `rename_note` | Renommer/déplacer des notes |
| `create_folder` | Créer de nouveaux dossiers |
| `list_folders` | Lister les dossiers dans le coffre |
| `get_active_note_info` | Obtenir des infos sur la note active |
| `get_rag_sync_status` | Vérifier le statut de synchronisation RAG |

### Mode Outils du Coffre

Contrôlez quels outils du coffre l'IA peut utiliser via l'icône de base de données (📦) sous le bouton de pièce jointe :

| Mode | Description | Outils Disponibles |
|------|-------------|-------------------|
| **Vault: Tous** | Accès complet au coffre | Tous les outils |
| **Vault: Sans recherche** | Exclure les outils de recherche | Tous sauf `search_notes`, `list_notes` |
| **Vault: Désactivé** | Aucun accès au coffre | Aucun |

**Sélection automatique du mode :**

| Condition | Mode Par Défaut | Modifiable |
|-----------|-----------------|------------|
| Modèles CLI (Gemini/Claude/Codex CLI) | Vault: Désactivé | Non |
| Modèles Gemma | Vault: Désactivé | Non |
| Web Search activé | Vault: Désactivé | Non |
| Flash Lite + RAG | Vault: Désactivé | Non |
| RAG activé | Vault: Sans recherche | Oui |
| Sans RAG | Vault: Tous | Oui |

> **Conseil :** Lors de l'utilisation de RAG, "Vault: Sans recherche" est recommandé pour éviter les recherches redondantes – RAG fournit déjà une recherche sémantique sur tout le coffre.

## Édition Sécurisée

Quand l'IA utilise `propose_edit` :
1. Un dialogue de confirmation affiche les modifications proposées
2. Cliquez sur **Appliquer** pour écrire les modifications dans le fichier
3. Cliquez sur **Annuler** pour annuler sans modifier le fichier

> Les modifications ne sont PAS écrites tant que vous ne confirmez pas.

## Historique d'Édition

Suivez et restaurez les modifications apportées à vos notes :

- **Suivi automatique** - Toutes les modifications IA (chat, workflow) et manuelles sont enregistrées
- **Voir l'historique** - Commande : "Show edit history" ou utilisez la palette de commandes
- **Vue des différences** - Voyez exactement ce qui a changé avec ajouts/suppressions codés par couleur
- **Restaurer** - Revenez à n'importe quelle version précédente en un clic
- **Modal redimensionnable** - Glissez pour déplacer, redimensionnez depuis les coins

**Affichage des différences :**
- Les lignes `+` existaient dans la version précédente
- Les lignes `-` ont été ajoutées dans la version plus récente

**Comment ça fonctionne :**

L'historique d'édition utilise une approche basée sur les instantanés :

1. **Création d'instantané** - Quand un fichier est ouvert pour la première fois ou modifié par l'IA, un instantané de son contenu est sauvegardé
2. **Enregistrement des différences** - Quand le fichier est modifié, la différence entre le nouveau contenu et l'instantané est enregistrée comme entrée d'historique
3. **Mise à jour de l'instantané** - L'instantané est mis à jour avec le nouveau contenu après chaque modification
4. **Restaurer** - Pour restaurer une version précédente, les différences sont appliquées en sens inverse depuis l'instantané

**Quand l'historique est enregistré :**
- Modifications chat IA (outil `propose_edit`)
- Modifications de notes dans les workflows (nœud `note`)
- Sauvegardes manuelles via commande
- Auto-détection quand le fichier diffère de l'instantané à l'ouverture

**Emplacement de stockage :**
- Fichiers d'historique : `{workspaceFolder}/history/{filename}.history.md`
- Fichiers d'instantané : `{workspaceFolder}/history/{filename}.snapshot.md`

**Paramètres :**
- Activer/désactiver dans les paramètres du plugin
- Configurer les lignes de contexte pour les différences
- Définir les limites de rétention (entrées max par fichier, âge max)

![Modal Historique d'Édition](edit_history.png)

## RAG

Génération Augmentée par Récupération pour une recherche intelligente dans le coffre :

- **Fichiers supportés** - Markdown, PDF, Images (PNG, JPEG, GIF, WebP)
- **Mode interne** - Synchroniser les fichiers du coffre vers Google File Search
- **Mode externe** - Utiliser des IDs de store existants
- **Synchronisation incrémentale** - Uploader uniquement les fichiers modifiés
- **Dossiers cibles** - Spécifier les dossiers à inclure
- **Patterns d'exclusion** - Patterns regex pour exclure des fichiers

![Paramètres RAG](setting_rag.png)

---

# Constructeur de Workflows

Construisez des workflows automatisés multi-étapes directement dans les fichiers Markdown. **Aucune connaissance en programmation requise** - décrivez simplement ce que vous voulez en langage naturel, et l'IA créera le workflow pour vous.

![Éditeur Visuel de Workflow](visual_workflow.png)

## Création de Workflows Assistée par IA

**Vous n'avez pas besoin d'apprendre la syntaxe YAML ou les types de nœuds.** Décrivez simplement votre workflow en langage courant :

1. Ouvrez l'onglet **Workflow** dans la barre latérale Gemini
2. Sélectionnez **+ Nouveau (IA)** dans le menu déroulant
3. Décrivez ce que vous voulez : *"Créer un workflow qui résume la note sélectionnée et l'enregistre dans un dossier summaries"*
4. Cliquez sur **Générer** - l'IA crée le workflow complet

![Créer un Workflow avec l'IA](create_workflow_with_ai.png)

**Modifiez les workflows existants de la même manière :**
1. Chargez n'importe quel workflow
2. Cliquez sur le bouton **Modifier avec IA**
3. Décrivez les modifications : *"Ajouter une étape pour traduire le résumé en japonais"*
4. Vérifiez et appliquez

![Modification de Workflow par IA](modify_workflow_with_ai.png)

## Démarrage Rapide (Manuel)

Vous pouvez également écrire des workflows manuellement. Ajoutez un bloc de code workflow à n'importe quel fichier Markdown :

````markdown
```workflow
name: Résumé Rapide
nodes:
  - id: input
    type: dialog
    title: Entrez le sujet
    inputTitle: Sujet
    saveTo: topic
  - id: generate
    type: command
    prompt: "Écrivez un bref résumé sur {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Ouvrez l'onglet **Workflow** dans la barre latérale Gemini pour l'exécuter.

## Types de Nœuds Disponibles

22 types de nœuds sont disponibles pour construire des workflows :

| Catégorie | Nœuds |
|-----------|-------|
| Variables | `variable`, `set` |
| Contrôle | `if`, `while` |
| LLM | `command` |
| Données | `http`, `json` |
| Notes | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Fichiers | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composition | `workflow` |
| RAG | `rag-sync` |
| Externe | `mcp`, `obsidian-command` |

> **Pour les spécifications détaillées des nœuds et des exemples, voir [WORKFLOW_NODES_fr.md](WORKFLOW_NODES_fr.md)**

## Mode Raccourcis Clavier

Assignez des raccourcis clavier pour exécuter des workflows instantanément :

1. Ajoutez un champ `name:` à votre workflow
2. Ouvrez le fichier workflow et sélectionnez le workflow dans le menu déroulant
3. Cliquez sur l'icône clavier (⌨️) dans le pied de page du panneau Workflow
4. Allez dans Paramètres → Raccourcis clavier → recherchez "Workflow: [Nom de Votre Workflow]"
5. Assignez un raccourci (ex., `Ctrl+Shift+T`)

Quand déclenché par raccourci :
- `prompt-file` utilise le fichier actif automatiquement (pas de dialogue)
- `prompt-selection` utilise la sélection courante, ou le contenu complet du fichier si pas de sélection

## Déclencheurs d'Événements

Les workflows peuvent être automatiquement déclenchés par des événements Obsidian :

![Paramètres de Déclencheur d'Événement](event_setting.png)

| Événement | Description |
|-----------|-------------|
| Fichier Créé | Déclenché quand un nouveau fichier est créé |
| Fichier Modifié | Déclenché quand un fichier est sauvegardé (avec délai de 5s) |
| Fichier Supprimé | Déclenché quand un fichier est supprimé |
| Fichier Renommé | Déclenché quand un fichier est renommé |
| Fichier Ouvert | Déclenché quand un fichier est ouvert |

**Configuration du déclencheur d'événement :**
1. Ajoutez un champ `name:` à votre workflow
2. Ouvrez le fichier workflow et sélectionnez le workflow dans le menu déroulant
3. Cliquez sur l'icône éclair (⚡) dans le pied de page du panneau Workflow
4. Sélectionnez quels événements doivent déclencher le workflow
5. Optionnellement ajoutez un filtre de pattern de fichier

**Exemples de patterns de fichier :**
- `**/*.md` - Tous les fichiers Markdown dans n'importe quel dossier
- `journal/*.md` - Fichiers Markdown dans le dossier journal uniquement
- `*.md` - Fichiers Markdown dans le dossier racine uniquement
- `**/{daily,weekly}/*.md` - Fichiers dans les dossiers daily ou weekly
- `projects/[a-z]*.md` - Fichiers commençant par une lettre minuscule

**Variables d'événement :** Quand déclenché par un événement, ces variables sont définies automatiquement :

| Variable | Description |
|----------|-------------|
| `__eventType__` | Type d'événement : `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Chemin du fichier affecté |
| `__eventFile__` | JSON avec les infos du fichier (path, basename, name, extension) |
| `__eventFileContent__` | Contenu du fichier (pour les événements create/modify/file-open) |
| `__eventOldPath__` | Chemin précédent (pour les événements rename uniquement) |

> **Note :** Les nœuds `prompt-file` et `prompt-selection` utilisent automatiquement le fichier de l'événement quand déclenchés par des événements. `prompt-selection` utilise le contenu entier du fichier comme sélection.

---

# Commun

## Modèles Supportés

### Plan Payant
| Modèle | Description |
|--------|-------------|
| Gemini 3 Flash Preview | Modèle rapide, contexte 1M (par défaut) |
| Gemini 3 Pro Preview | Modèle phare, contexte 1M |
| Gemini 2.5 Flash Lite | Modèle flash léger |
| Gemini 2.5 Flash (Image) | Génération d'images, 1024px |
| Gemini 3 Pro (Image) | Génération d'images Pro, 4K |

### Plan Gratuit
| Modèle | Opérations sur le Coffre |
|--------|--------------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Installation

### BRAT (Recommandé)
1. Installez le plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Ouvrez les paramètres BRAT → "Add Beta plugin"
3. Entrez : `https://github.com/takeshy/obsidian-gemini-helper`
4. Activez le plugin dans les paramètres des plugins communautaires

### Manuel
1. Téléchargez `main.js`, `manifest.json`, `styles.css` depuis les releases
2. Créez le dossier `gemini-helper` dans `.obsidian/plugins/`
3. Copiez les fichiers et activez dans les paramètres Obsidian

### Depuis les Sources
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configuration

### Paramètres API
1. Obtenez une clé API depuis [ai.google.dev](https://ai.google.dev)
2. Entrez-la dans les paramètres du plugin
3. Sélectionnez le plan API (Gratuit/Payant)

![Paramètres de Base](setting_basic.png)

### Mode CLI (Gemini / Claude / Codex)

**Gemini CLI :**
1. Installez [Gemini CLI](https://github.com/google-gemini/gemini-cli)
2. Authentifiez-vous avec `gemini` → `/auth`
3. Cliquez sur "Verify" dans la section Gemini CLI

**Claude CLI :**
1. Installez [Claude Code](https://github.com/anthropics/claude-code) : `npm install -g @anthropic-ai/claude-code`
2. Authentifiez-vous avec `claude`
3. Cliquez sur "Verify" dans la section Claude CLI

**Codex CLI :**
1. Installez [Codex CLI](https://github.com/openai/codex) : `npm install -g @openai/codex`
2. Authentifiez-vous avec `codex`
3. Cliquez sur "Verify" dans la section Codex CLI

**Limitations CLI :** Opérations sur le coffre en lecture seule, pas de recherche sémantique/web

### Paramètres de l'Espace de Travail
- **Dossier de l'Espace de Travail** - Emplacement de l'historique de chat et des paramètres
- **Prompt Système** - Instructions additionnelles pour l'IA
- **Limites d'Outils** - Contrôler les limites d'appels de fonctions
- **Historique d'Édition** - Suivez et restaurez les modifications faites par l'IA

![Limite d'Outils & Historique d'Édition](setting_tool_history.png)

### Commandes Slash
- Définir des modèles de prompts personnalisés déclenchés par `/`
- Modèle et recherche optionnels par commande

![Commandes Slash](setting_slash_command.png)

## Utilisation

### Ouvrir le Chat
- Cliquez sur l'icône Gemini dans le ruban
- Commande : "Gemini Helper: Open chat"
- Basculer : "Gemini Helper: Toggle chat / editor"

### Contrôles du Chat
- **Entrée** - Envoyer le message
- **Shift+Entrée** - Nouvelle ligne
- **Bouton Stop** - Arrêter la génération
- **Bouton +** - Nouveau chat
- **Bouton Historique** - Charger les chats précédents

### Utilisation des Workflows
1. Ouvrez l'onglet **Workflow** dans la barre latérale
2. Ouvrez un fichier avec un bloc de code `workflow`
3. Sélectionnez le workflow dans le menu déroulant
4. Cliquez sur **Exécuter** pour lancer
5. Cliquez sur **Historique** pour voir les exécutions passées

![Historique des Workflows](workflow_history.png)

**Visualiser comme Organigramme :** Cliquez sur le bouton **Canvas** (icône grille) dans le panneau Workflow pour exporter votre workflow sous forme de Canvas Obsidian. Cela crée un organigramme visuel où :
- Les boucles et les branches sont clairement affichées avec un routage approprié
- Les nœuds de décision (`if`/`while`) affichent les chemins Oui/Non
- Les flèches de retour sont acheminées autour des nœuds pour plus de clarté
- Chaque nœud affiche sa configuration complète
- Un lien vers le fichier workflow source est inclus pour une navigation rapide

![Workflow to Canvas](workflow_to_canvas.png)

C'est particulièrement utile pour comprendre les workflows complexes avec plusieurs branches et boucles.

**Exporter l'Historique d'Exécution :** Visualisez l'historique d'exécution sous forme de Canvas Obsidian pour une analyse visuelle.

![Vue Canvas de l'Historique](history_canvas.png)

### Génération de Workflows par IA

**Créer un Nouveau Workflow avec l'IA :**
1. Sélectionnez **+ Nouveau (IA)** dans le menu déroulant des workflows
2. Entrez le nom du workflow et le chemin de sortie (supporte la variable `{{name}}`)
3. Décrivez ce que le workflow doit faire en langage naturel
4. Sélectionnez un modèle et cliquez sur **Générer**
5. Le workflow est automatiquement créé et sauvegardé

**Références de Fichiers avec @ :**

Tapez `@` dans le champ de description pour référencer des fichiers :
- `@{selection}` - Sélection actuelle de l'éditeur
- `@{content}` - Contenu de la note active
- `@path/to/file.md` - N'importe quel fichier du vault

Lorsque vous cliquez sur Générer, le contenu du fichier est intégré directement dans la requête IA. Le frontmatter YAML est automatiquement supprimé.

> **Conseil :** Ceci est utile pour créer des workflows basés sur des exemples ou modèles de workflow existants dans votre vault.

**Historique des Requêtes :**

Chaque workflow généré par IA enregistre une entrée d'historique au-dessus du bloc de code du workflow, incluant :
- Horodatage et action (Créé/Modifié)
- Votre description de la requête
- Contenus des fichiers référencés (dans des sections repliables)

![Historique IA du Workflow](workflow_ai_history.png)

**Modifier un Workflow Existant avec l'IA :**
1. Chargez un workflow existant
2. Cliquez sur le bouton **Modifier avec IA** (icône étincelle)
3. Décrivez les modifications souhaitées
4. Vérifiez la comparaison avant/après
5. Cliquez sur **Appliquer les Modifications** pour mettre à jour

![Modification de Workflow par IA](modify_workflow_with_ai.png)

**Édition Manuelle de Workflow :**

Éditez les workflows directement dans l'éditeur visuel de nœuds avec interface glisser-déposer.

![Édition Manuelle de Workflow](modify_workflow_manual.png)

**Recharger depuis le Fichier :**
- Sélectionnez **Recharger depuis le fichier** dans le menu déroulant pour réimporter le workflow depuis le fichier markdown

## Prérequis

- Obsidian v0.15.0+
- Clé API Google AI, ou outil CLI (Gemini CLI / Claude CLI / Codex CLI)
- Desktop et mobile supportés (mode CLI : desktop uniquement)

## Confidentialité

**Données stockées localement :**
- Clé API (stockée dans les paramètres Obsidian)
- Historique des chats (en fichiers Markdown)
- Historique d'exécution des workflows

**Données envoyées à Google :**
- Tous les messages de chat et pièces jointes sont envoyés à l'API Google Gemini pour traitement
- Quand le RAG est activé, les fichiers du coffre sont uploadés vers Google File Search
- Quand la Recherche Web est activée, les requêtes sont envoyées à Google Search

**Données envoyées à des services tiers :**
- Les nœuds `http` des workflows peuvent envoyer des données à n'importe quelle URL spécifiée dans le workflow

**Fournisseurs CLI (optionnel) :**
- Quand le mode CLI est activé, les outils CLI externes (gemini, claude, codex) sont exécutés via child_process
- Cela se produit uniquement quand explicitement configuré et vérifié par l'utilisateur
- Le mode CLI est uniquement disponible sur desktop (non disponible sur mobile)

**Notes de sécurité :**
- Vérifiez les workflows avant de les exécuter - les nœuds `http` peuvent transmettre des données du coffre à des endpoints externes
- Les nœuds `note` des workflows affichent un dialogue de confirmation avant d'écrire des fichiers (comportement par défaut)
- Les commandes slash avec `confirmEdits: false` appliqueront automatiquement les modifications de fichiers sans afficher les boutons Appliquer/Annuler

Voir les [Conditions d'Utilisation de Google AI](https://ai.google.dev/terms) pour les politiques de rétention des données.

## Licence

MIT

## Liens

- [Documentation API Gemini](https://ai.google.dev/docs)
- [Documentation des Plugins Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Support

Si vous trouvez ce plugin utile, pensez à m'offrir un café !

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
