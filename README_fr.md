# Gemini Helper pour Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

Assistant IA **gratuit et open-source** pour Obsidian avec **Chat**, **Automatisation de Workflows** et **RAG** propulse par Google Gemini.

> **Depuis la v1.11.0, ce plugin se concentre exclusivement sur les fonctionnalites liees a Gemini.**
> Le support CLI a ete supprime. Un nouveau plugin [obsidian-llm-hub](https://github.com/takeshy/obsidian-llm-hub) a ete cree avec le support CLI et multi-fournisseurs LLM (OpenAI, Claude, OpenRouter, Local LLM).
> L'integration GemiHub (Google Drive) a ete separee dans [obsidian-gemihub](https://github.com/takeshy/obsidian-gemihub).

### Plugins Associes

| Plugin | Description |
|--------|-------------|
| obsidian-gemini-helper | Centre sur Gemini (RAG via File Search API) |
| obsidian-llm-hub | Support multi-LLM, Desktop uniquement (RAG via Embedding, supporte gemini-embedding-2-preview) |
| obsidian-local-llm-hub | LLM local uniquement (RAG via embeddings locaux uniquement) |
| obsidian-gemihub | Synchronisation de fichiers avec GemiHub (version web de gemini-helper) via Google Drive |

---

> **Ce plugin est entierement gratuit.** Vous avez uniquement besoin d'une cle API Google Gemini (gratuite ou payante) depuis [ai.google.dev](https://ai.google.dev).

## Points Forts

- **Chat IA** - Reponses en streaming, pieces jointes, operations sur le coffre, commandes slash
- **Constructeur de Workflows** - Automatisez des taches multi-etapes avec l'editeur visuel de noeuds et 24 types de noeuds
- **Historique d'Edition** - Suivez et restaurez les modifications faites par l'IA avec vue des differences
- **RAG** - Generation Augmentee par Recuperation pour une recherche intelligente dans votre coffre
- **Recherche Web** - Accedez a des informations actualisees via Google Search
- **Generation d'Images** - Creez des images avec les modeles d'images Gemini
- **Chiffrement** - Protection par mot de passe de l'historique de chat et des journaux d'execution des workflows

![Generation d'images dans le chat](docs/images/chat_image.png)

## Cle API

Ce plugin necessite une cle API Google Gemini. Vous pouvez choisir entre :

| Fonctionnalite | Cle API Gratuite | Cle API Payante |
|----------------|------------------|-----------------|
| Chat basique | ✅ | ✅ |
| Operations sur le coffre | ✅ | ✅ |
| Recherche Web | ✅ | ✅ |
| RAG | ✅ (limite) | ✅ |
| Workflow | ✅ | ✅ |
| Generation d'images | ❌ | ✅ |
| Modeles | Flash, Gemma | Flash, Pro, Image |
| Cout | **Gratuit** | Paiement a l'usage |

### Conseils pour la Cle API Gratuite

- Les **limites de debit** sont par modele et se reinitialisent quotidiennement. Changez de modele pour continuer a travailler.
- La **synchronisation RAG** est limitee. Lancez "Sync Vault" quotidiennement - les fichiers deja uploades sont ignores.
- Les **modeles Gemma** ne supportent pas les operations sur le coffre dans le Chat, mais les **Workflows peuvent toujours lire/ecrire des notes** en utilisant les types de noeuds `note`, `note-read` et autres. Les variables `{content}` et `{selection}` fonctionnent egalement.

---

# Chat IA

La fonctionnalite Chat IA fournit une interface de conversation interactive avec Google Gemini, integree a votre coffre Obsidian.

![Interface de Chat](docs/images/chat.png)

## Ouvrir le Chat
- Cliquez sur l'icone Gemini dans le ruban
- Commande : "Gemini Helper: Open chat"
- Basculer : "Gemini Helper: Toggle chat / editor"

## Controles du Chat
- **Entree** - Envoyer le message
- **Shift+Entree** - Nouvelle ligne
- **Bouton Stop** - Arreter la generation
- **Bouton +** - Nouveau chat
- **Bouton Historique** - Charger les chats precedents

## Commandes Slash

Creez des modeles de prompts reutilisables declenches par `/` :

- Definissez des modeles avec `{selection}` (texte selectionne) et `{content}` (note active)
- Modele et recherche optionnels personnalisables par commande
- Tapez `/` pour voir les commandes disponibles

**Par defaut :** `/infographic` - Convertit le contenu en infographie HTML

![Exemple d'Infographie](docs/images/chat_infographic.png)

## Mentions @

Referencez des fichiers et variables en tapant `@` :

- `{selection}` - Texte selectionne
- `{content}` - Contenu de la note active
- N'importe quel fichier du coffre - Parcourez et inserez (chemin uniquement ; l'IA lit le contenu via les outils)

> [!NOTE]
> **Comment fonctionnent `{selection}` et `{content}` :** Lorsque vous passez de la vue Markdown a la vue Chat, la selection serait normalement effacee en raison du changement de focus. Pour preserver votre selection, le plugin la capture lors du changement de vue et met en surbrillance la zone selectionnee avec une couleur d'arriere-plan dans la vue Markdown. L'option `{selection}` n'apparait dans les suggestions @ que lorsqu'un texte a ete selectionne.
>
> `{selection}` et `{content}` ne sont intentionnellement **pas developpes** dans la zone de saisie--comme la zone de saisie du chat est compacte, developper un texte long rendrait la saisie difficile. Le contenu est developpe lorsque vous envoyez le message, ce que vous pouvez verifier en consultant votre message envoye dans le chat.

> [!NOTE]
> Les mentions @ de fichiers du coffre inserent uniquement le chemin du fichier - l'IA lit le contenu via les outils. Cela ne fonctionne pas avec les modeles Gemma (pas de support des outils du coffre).

## Pieces Jointes

Joignez des fichiers directement : Images (PNG, JPEG, GIF, WebP), PDFs, Fichiers texte, Audio (MP3, WAV, FLAC, AAC, Opus, OGG), Video (MP4, WebM, MOV, AVI, MKV)

## Appel de Fonctions (Operations sur le Coffre)

L'IA peut interagir avec votre coffre en utilisant ces outils :

| Outil | Description |
|-------|-------------|
| `read_note` | Lire le contenu d'une note |
| `create_note` | Creer de nouvelles notes |
| `propose_edit` | Editer avec dialogue de confirmation |
| `propose_delete` | Supprimer avec dialogue de confirmation |
| `bulk_propose_edit` | Edition en masse de plusieurs fichiers avec dialogue de selection |
| `bulk_propose_delete` | Suppression en masse de plusieurs fichiers avec dialogue de selection |
| `search_notes` | Rechercher dans le coffre par nom ou contenu |
| `list_notes` | Lister les notes dans un dossier |
| `rename_note` | Renommer/deplacer des notes |
| `create_folder` | Creer de nouveaux dossiers |
| `list_folders` | Lister les dossiers dans le coffre |
| `get_active_note_info` | Obtenir des infos sur la note active |
| `get_rag_sync_status` | Verifier le statut de synchronisation RAG |
| `bulk_propose_rename` | Renommage en masse de plusieurs fichiers avec dialogue de selection |

### Mode Outils du Coffre

Lorsque l'IA gere des notes dans le Chat, elle utilise les outils du Vault. Controlez quels outils du coffre l'IA peut utiliser via l'icone de base de donnees (📦) sous le bouton de piece jointe :

| Mode | Description | Outils Disponibles |
|------|-------------|-------------------|
| **Vault: Tous** | Acces complet au coffre | Tous les outils |
| **Vault: Sans recherche** | Exclure les outils de recherche | Tous sauf `search_notes`, `list_notes` |
| **Vault: Desactive** | Aucun acces au coffre | Aucun |

**Quand utiliser chaque mode :**

- **Vault: Tous** - Mode par defaut pour une utilisation generale. L'IA peut lire, ecrire et rechercher dans votre coffre.
- **Vault: Sans recherche** - Utilisez-le lorsque vous souhaitez rechercher uniquement avec RAG, ou lorsque vous connaissez deja le fichier cible. Cela evite les recherches redondantes dans le vault, economisant des tokens et ameliorant le temps de reponse.
- **Vault: Desactive** - Utilisez-le lorsque vous n'avez pas besoin d'acces au vault du tout.

**Selection automatique du mode :**

| Condition | Mode Par Defaut | Modifiable |
|-----------|-----------------|------------|
| Modeles Gemma | Vault: Desactive | Non |
| Web Search active | Vault: Desactive | Non |
| RAG active | Vault: Desactive | Non |
| Sans RAG | Vault: Tous | Oui |

**Pourquoi certains modes sont forces :**

- **Modeles Gemma** : Ces modeles ne prennent pas en charge les appels de fonction, donc les outils Vault ne peuvent pas etre utilises.
- **Web Search** : Par conception, les outils Vault sont desactives lorsque Web Search est active.
- **RAG active** : L'API Gemini ne prend pas en charge la combinaison de File Search (RAG) avec les appels de fonction. Lorsque le RAG est active, les outils Vault et MCP sont automatiquement desactives.

## Edition Securisee

Quand l'IA utilise `propose_edit` :
1. Un dialogue de confirmation affiche les modifications proposees
2. Cliquez sur **Appliquer** pour ecrire les modifications dans le fichier
3. Cliquez sur **Annuler** pour annuler sans modifier le fichier

> Les modifications ne sont PAS ecrites tant que vous ne confirmez pas.

## Historique d'Edition

Suivez et restaurez les modifications apportees a vos notes :

- **Suivi automatique** - Toutes les modifications IA (chat, workflow) et manuelles sont enregistrees
- **Acces via menu fichier** - Clic droit sur un fichier markdown pour acceder a :
  - **Snapshot** - Sauvegarder l'etat actuel comme instantane
  - **History** - Ouvrir le modal d'historique d'edition

- **Palette de commandes** - Aussi disponible via la commande "Show edit history"
- **Vue des differences** - Voyez exactement ce qui a change avec ajouts/suppressions codes par couleur
- **Restaurer** - Revenez a n'importe quelle version precedente en un clic
- **Copier** - Enregistre une version historique comme nouveau fichier (nom par defaut : `{filename}_{datetime}.md`)
- **Modal redimensionnable** - Glissez pour deplacer, redimensionnez depuis les coins

**Affichage des differences :**
- Les lignes `+` existaient dans la version precedente
- Les lignes `-` ont ete ajoutees dans la version plus recente

**Comment ca fonctionne :**

L'historique d'edition utilise une approche basee sur les instantanes :

1. **Creation d'instantane** - Quand un fichier est ouvert pour la premiere fois ou modifie par l'IA, un instantane de son contenu est sauvegarde
2. **Enregistrement des differences** - Quand le fichier est modifie, la difference entre le nouveau contenu et l'instantane est enregistree comme entree d'historique
3. **Mise a jour de l'instantane** - L'instantane est mis a jour avec le nouveau contenu apres chaque modification
4. **Restaurer** - Pour restaurer une version precedente, les differences sont appliquees en sens inverse depuis l'instantane

**Quand l'historique est enregistre :**
- Modifications chat IA (outil `propose_edit`)
- Modifications de notes dans les workflows (noeud `note`)
- Sauvegardes manuelles via commande
- Auto-detection quand le fichier differe de l'instantane a l'ouverture

**Stockage :** L'historique des modifications est stocke en memoire et efface au redemarrage d'Obsidian. Le suivi persistant des versions est couvert par la recuperation de fichiers integree d'Obsidian.

![Modal Historique d'Edition](docs/images/edit_history.png)

## RAG

Generation Augmentee par Recuperation pour une recherche intelligente dans le coffre :

- **Fichiers supportes** - Markdown, PDF, Documents Office (Doc, Docx, XLS, XLSX, PPTX)
- **Mode interne** - Synchroniser les fichiers du coffre vers Google File Search
- **Mode externe** - Utiliser des IDs de store existants
- **Synchronisation incrementale** - Uploader uniquement les fichiers modifies
- **Dossiers cibles** - Specifier les dossiers a inclure
- **Patterns d'exclusion** - Patterns regex pour exclure des fichiers

![Parametres RAG](docs/images/setting_rag.png)

## Serveurs MCP

Les serveurs MCP (Model Context Protocol) fournissent des outils supplementaires qui etendent les capacites de l'IA au-dela des operations du vault.

**Configuration :**

1. Ouvrez les parametres du plugin -> section **Serveurs MCP**
2. Cliquez sur **Ajouter un serveur**
3. Entrez le nom et l'URL du serveur
4. Configurez les en-tetes optionnels (format JSON) pour l'authentification
5. Cliquez sur **Tester la connexion** pour verifier et recuperer les outils disponibles
6. Enregistrez la configuration du serveur

> **Note :** Le test de connexion est obligatoire avant l'enregistrement. Cela garantit que le serveur est accessible et affiche les outils disponibles.

![Parametres des Serveurs MCP](docs/images/setting_mcp.png)

**Utilisation des outils MCP :**

- **Dans le chat :** Cliquez sur l'icone de base de donnees (📦) pour ouvrir les parametres des outils. Activez/desactivez les serveurs MCP par conversation.
- **Dans les workflows :** Utilisez le noeud `mcp` pour appeler les outils du serveur MCP.

**Indices d'outils :** Apres un test de connexion reussi, les noms des outils disponibles sont enregistres et affiches dans les parametres et l'interface de chat.

### MCP Apps (UI Interactive)

Certains outils MCP retournent une UI interactive qui permet d'interagir visuellement avec les resultats de l'outil. Cette fonctionnalite est basee sur la [specification MCP Apps](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps).

**Comment ca fonctionne :**

- Quand un outil MCP retourne un URI de ressource `ui://` dans les metadonnees de sa reponse, le plugin recupere et affiche le contenu HTML
- L'UI est affichee dans un iframe isole pour la securite (`sandbox="allow-scripts allow-forms"`)
- Les applications interactives peuvent appeler des outils MCP supplementaires et mettre a jour le contexte via un pont JSON-RPC

**Dans le Chat :**
- MCP Apps apparait en ligne dans les messages de l'assistant avec un bouton developper/reduire
- Cliquez sur ⊕ pour developper en plein ecran, ⊖ pour reduire

**Dans les Workflows :**
- MCP Apps est affiche dans une boite de dialogue modale pendant l'execution du workflow
- Le workflow se met en pause pour permettre l'interaction de l'utilisateur, puis continue quand le modal est ferme

> **Securite :** Tout le contenu MCP App s'execute dans un iframe isole avec des permissions restreintes. L'iframe ne peut pas acceder au DOM de la page parente, aux cookies ou au stockage local. Seuls `allow-scripts` et `allow-forms` sont actives.

## Skills d'Agent

Etendez les capacites de l'IA avec des instructions personnalisees, des documents de reference et des workflows executables. Les skills suivent le modele standard de l'industrie pour les skills d'agent (ex. [OpenAI Codex](https://github.com/openai/codex) `.codex/skills/`).

- **Skills intégrés** - Connaissances spécifiques à Obsidian (Markdown, Canvas, Bases) incluses par défaut. Basé sur [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- **Instructions personnalisees** - Definissez un comportement specifique au domaine via des fichiers `SKILL.md`
- **Documents de reference** - Incluez des guides de style, modeles et listes de controle dans `references/`
- **Integration des workflows** - Les skills peuvent exposer des workflows comme outils de Function Calling
- **Commande slash** - Tapez `/folder-name` pour invoquer un skill instantanement et envoyer
- **Activation selective** - Choisissez quels skills sont actifs par conversation

Creez des skills de la meme maniere que les workflows -- selectionnez **+ New (AI)**, cochez **"Creer en tant qu'agent skill"** et decrivez ce que vous souhaitez. L'AI genere a la fois les instructions du `SKILL.md` et le workflow.

> **Pour les instructions de configuration et des exemples, consultez [SKILLS.md](docs/SKILLS_fr.md)**

---

# Constructeur de Workflows

Construisez des workflows automatises multi-etapes directement dans les fichiers Markdown. **Aucune connaissance en programmation requise** - decrivez simplement ce que vous voulez en langage naturel, et l'IA creera le workflow pour vous.

![Editeur Visuel de Workflow](docs/images/visual_workflow.png)

## Execution des Workflows

**Depuis la Barre Laterale :**
1. Ouvrez l'onglet **Workflow** dans la barre laterale
2. Ouvrez un fichier avec un bloc de code `workflow`
3. Selectionnez le workflow dans le menu deroulant (ou choisissez **Browse all workflows** pour rechercher tous les workflows du coffre)
4. Cliquez sur **Executer** pour lancer
5. Cliquez sur **Historique** pour voir les executions passees

**Depuis la Palette de Commandes (Run Workflow) :**

Utilisez la commande "Gemini Helper: Run Workflow" pour parcourir et executer des workflows depuis n'importe ou :

1. Ouvrez la palette de commandes et recherchez "Run Workflow"
2. Parcourez tous les fichiers du vault contenant des blocs de code workflow (les fichiers du dossier `workflows/` sont affiches en premier)
3. Previsualisez le contenu du workflow et l'historique de generation par IA
4. Selectionnez un workflow et cliquez sur **Run** pour executer

![Modal Executer Workflow](docs/images/workflow_list.png)

Ceci est utile pour executer rapidement des workflows sans naviguer d'abord vers le fichier du workflow.

![Historique des Workflows](docs/images/workflow_history.png)

**Exporter l'historique d'execution :** Visualisez l'historique d'execution sous forme de Canvas Obsidian pour une analyse visuelle. Cliquez sur **Open Canvas view** dans le modal Historique pour creer un fichier Canvas.

> **Remarque :** Les fichiers Canvas sont crees dynamiquement dans le dossier workspace. Supprimez-les manuellement apres examen s'ils ne sont plus necessaires.

![Vue Canvas de l'Historique](docs/images/history_canvas.png)

## Creation de Workflows et Skills avec l'IA

**Vous n'avez pas besoin d'apprendre la syntaxe YAML ou les types de noeuds.** Decrivez simplement votre workflow en langage courant :

1. Ouvrez l'onglet **Workflow** dans la barre laterale Gemini
2. Selectionnez **+ New (AI)** dans le menu deroulant
3. Decrivez ce que vous voulez : *"Creer un workflow qui resume la note selectionnee et l'enregistre dans un dossier summaries"*
4. Cochez **"Creer en tant qu'agent skill"** si vous souhaitez creer un agent skill au lieu d'un workflow autonome
5. Selectionnez un modele et cliquez sur **Generer**
6. Le workflow est automatiquement cree et sauvegarde
> **Astuce :** Lors de l'utilisation de **+ New (AI)** depuis le menu deroulant sur un fichier qui contient deja des workflows, le chemin de sortie est defini par defaut sur le fichier actuel. Le workflow genere sera ajoute a ce fichier.

**Creer un workflow depuis n'importe quel fichier :**

Lors de l'ouverture de l'onglet Workflow avec un fichier qui n'a pas de bloc de code workflow, un bouton **"Create workflow with AI"** est affiche. Cliquez dessus pour generer un nouveau workflow (sortie par defaut : `workflows/{{name}}.md`).

**References de Fichiers avec @ :**

Tapez `@` dans le champ de description pour referencer des fichiers :
- `@{selection}` - Selection actuelle de l'editeur
- `@{content}` - Contenu de la note active
- `@path/to/file.md` - N'importe quel fichier du vault

Lorsque vous cliquez sur Generer, le contenu du fichier est integre directement dans la requete IA. Le frontmatter YAML est automatiquement supprime.

> **Conseil :** Ceci est utile pour creer des workflows bases sur des exemples ou modeles de workflow existants dans votre vault.

**Pieces Jointes :**

Cliquez sur le bouton de piece jointe pour joindre des fichiers (images, PDFs, fichiers texte) a votre demande de generation de workflow. Ceci est utile pour fournir un contexte visuel ou des exemples a l'IA.

**Utiliser des LLMs Externes (Copier le Prompt / Coller la Reponse) :**

Vous pouvez utiliser n'importe quel LLM externe (Claude, GPT, etc.) pour generer des workflows :

1. Remplissez le nom et la description du workflow comme d'habitude
2. Cliquez sur **Copy Prompt** - le prompt complet est copie dans le presse-papiers
3. Collez le prompt dans votre LLM prefere
4. Copiez la reponse du LLM
5. Collez-la dans la zone de texte **Paste Response** qui apparait
6. Cliquez sur **Apply** pour creer le workflow

La reponse collee peut etre du YAML brut ou un document Markdown complet avec des blocs de code `` ```workflow ``. Les reponses Markdown sont enregistrees telles quelles, preservant toute documentation incluse par le LLM.

![Creer un Workflow avec l'IA](docs/images/create_workflow_with_ai.png)

**Controles du Modal :**

Le modal de workflow IA supporte le positionnement par glisser-deposer et le redimensionnement depuis les coins pour une meilleure experience d'edition.

**Historique des Requetes :**

Chaque workflow genere par IA enregistre une entree d'historique au-dessus du bloc de code du workflow, incluant :
- Horodatage et action (Cree/Modifie)
- Votre description de la requete
- Contenus des fichiers references (dans des sections repliables)
**Modifier les workflows existants de la meme maniere :**
1. Chargez n'importe quel workflow
2. Cliquez sur le bouton **AI Modify** (icone etincelle)
3. Decrivez les modifications : *"Ajouter une etape pour traduire le resume en japonais"*
4. Verifiez la comparaison avant/apres
5. Cliquez sur **Apply Changes** pour mettre a jour

**Reference a l'Historique d'Execution :**

Lors de la modification d'un workflow avec l'IA, vous pouvez faire reference aux resultats d'execution precedents pour aider l'IA a comprendre les problemes :

1. Cliquez sur le bouton **Reference execution history**
2. Selectionnez une execution dans la liste (les executions en erreur sont surlignees)
3. Choisissez les etapes a inclure (les etapes en erreur sont preselectionnees)
4. L'IA recoit les donnees d'entree/sortie de l'etape pour comprendre ce qui a mal tourne

C'est particulierement utile pour deboguer les workflows - vous pouvez dire a l'IA "Corrige l'erreur a l'etape 2" et elle verra exactement quelle entree a cause l'echec.

**Historique des Requetes :**

Lors de la regeneration d'un workflow (en cliquant sur "Non" dans l'apercu), toutes les requetes precedentes de la session sont transmises a l'IA. Cela aide l'IA a comprendre le contexte complet de vos modifications sur plusieurs iterations.

**Edition Manuelle de Workflow :**

Editez les workflows directement dans l'editeur visuel de noeuds avec interface glisser-deposer.

![Edition Manuelle de Workflow](docs/images/modify_workflow_manual.png)

**Recharger depuis le Fichier :**
- Selectionnez **Reload from file** dans le menu deroulant pour reimporter le workflow depuis le fichier markdown

## Demarrage Rapide (Manuel)

Vous pouvez egalement ecrire des workflows manuellement. Ajoutez un bloc de code workflow a n'importe quel fichier Markdown :

````markdown
```workflow
name: Resume Rapide
nodes:
  - id: input
    type: dialog
    title: Entrez le sujet
    inputTitle: Sujet
    saveTo: topic
  - id: generate
    type: command
    prompt: "Ecrivez un bref resume sur {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Ouvrez l'onglet **Workflow** dans la barre laterale Gemini pour l'executer.

## Types de Noeuds Disponibles

24 types de noeuds sont disponibles pour construire des workflows :

| Categorie | Noeuds |
|-----------|-------|
| Variables | `variable`, `set` |
| Controle | `if`, `while` |
| LLM | `command` |
| Donnees | `http`, `json`, `script` |
| Notes | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Fichiers | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composition | `workflow` |
| RAG | `rag-sync` |
| Externe | `mcp`, `obsidian-command` |
| Utilitaire | `sleep` |

> **Pour les specifications detaillees des noeuds et des exemples, voir [WORKFLOW_NODES_fr.md](docs/WORKFLOW_NODES_fr.md)**

## Mode Raccourcis Clavier

Assignez des raccourcis clavier pour executer des workflows instantanement :

1. Ajoutez un champ `name:` a votre workflow
2. Ouvrez le fichier workflow et selectionnez le workflow dans le menu deroulant
3. Cliquez sur l'icone clavier (⌨️) dans le pied de page du panneau Workflow
4. Allez dans Parametres -> Raccourcis clavier -> recherchez "Workflow: [Nom de Votre Workflow]"
5. Assignez un raccourci (ex., `Ctrl+Shift+T`)

Quand declenche par raccourci :
- `prompt-file` utilise le fichier actif automatiquement (pas de dialogue)
- `prompt-selection` utilise la selection courante, ou le contenu complet du fichier si pas de selection

## Declencheurs d'Evenements

Les workflows peuvent etre automatiquement declenches par des evenements Obsidian :

![Parametres de Declencheur d'Evenement](docs/images/event_setting.png)

| Evenement | Description |
|-----------|-------------|
| Fichier Cree | Declenche quand un nouveau fichier est cree |
| Fichier Modifie | Declenche quand un fichier est sauvegarde (avec delai de 5s) |
| Fichier Supprime | Declenche quand un fichier est supprime |
| Fichier Renomme | Declenche quand un fichier est renomme |
| Fichier Ouvert | Declenche quand un fichier est ouvert |

**Configuration du declencheur d'evenement :**
1. Ajoutez un champ `name:` a votre workflow
2. Ouvrez le fichier workflow et selectionnez le workflow dans le menu deroulant
3. Cliquez sur l'icone eclair (⚡) dans le pied de page du panneau Workflow
4. Selectionnez quels evenements doivent declencher le workflow
5. Optionnellement ajoutez un filtre de pattern de fichier

**Exemples de patterns de fichier :**
- `**/*.md` - Tous les fichiers Markdown dans n'importe quel dossier
- `journal/*.md` - Fichiers Markdown dans le dossier journal uniquement
- `*.md` - Fichiers Markdown dans le dossier racine uniquement
- `**/{daily,weekly}/*.md` - Fichiers dans les dossiers daily ou weekly
- `projects/[a-z]*.md` - Fichiers commencant par une lettre minuscule

**Variables d'evenement :** Quand declenche par un evenement, ces variables sont definies automatiquement :

| Variable | Description |
|----------|-------------|
| `_eventType` | Type d'evenement : `create`, `modify`, `delete`, `rename`, `file-open` |
| `_eventFilePath` | Chemin du fichier affecte |
| `_eventFile` | JSON avec les infos du fichier (path, basename, name, extension) |
| `_eventFileContent` | Contenu du fichier (pour les evenements create/modify/file-open) |
| `_eventOldPath` | Chemin precedent (pour les evenements rename uniquement) |

> **Note :** Les noeuds `prompt-file` et `prompt-selection` utilisent automatiquement le fichier de l'evenement quand declenches par des evenements. `prompt-selection` utilise le contenu entier du fichier comme selection.

---

# Commun

## Modeles Supportes

### Plan Payant
| Modele | Description |
|--------|-------------|
| Gemini 3.1 Pro Preview | Dernier modele phare, contexte 1M (recommande) |
| Gemini 3.1 Pro Preview (Custom Tools) | Optimise pour les flux de travail agentiques avec outils personnalises et bash |
| Gemini 3 Flash Preview | Modele rapide, contexte 1M, meilleur rapport cout-performance |
| Gemini 3.1 Flash Lite Preview | Modele le plus rentable avec hautes performances |
| Gemini 2.5 Flash | Modele rapide, contexte 1M |
| Gemini 2.5 Pro | Modele Pro, contexte 1M |
| Gemini 3 Pro (Image) | Generation d'images Pro, 4K |
| Gemini 3.1 Flash (Image) | Generation d'images rapide et economique |

> **Mode Thinking :** Dans le chat, le mode thinking est declenche par des mots-cles comme "think", "analyze" ou "consider" dans votre message. Cependant, **Gemini 3.1 Pro** utilise toujours le mode thinking independamment des mots-cles -- ce modele ne permet pas de desactiver le thinking.

**Bascule Always Think :**

Vous pouvez forcer le mode thinking a ON pour les modeles Flash sans utiliser de mots-cles. Cliquez sur l'icone de base de donnees (📦) pour ouvrir le menu des outils, et cochez les cases sous **Always Think** :

- **Flash** -- OFF par defaut. Cochez pour toujours activer le thinking pour les modeles Flash.
- **Flash Lite** -- ON par defaut. Flash Lite a une difference de cout et de vitesse minimale avec le thinking active, il est donc recommande de le garder active.

Quand une bascule est ON, le thinking est toujours actif pour cette famille de modeles independamment du contenu du message. Quand elle est OFF, la detection basee sur les mots-cles existante est utilisee.

![Always Think Settings](docs/images/setting_thinking.png)

### Plan Gratuit
| Modele | Operations sur le Coffre |
|--------|--------------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemini 3.1 Flash Lite Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Installation

### BRAT (Recommande)
1. Installez le plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Ouvrez les parametres BRAT -> "Add Beta plugin"
3. Entrez : `https://github.com/takeshy/obsidian-gemini-helper`
4. Activez le plugin dans les parametres des plugins communautaires

### Manuel
1. Telechargez `main.js`, `manifest.json`, `styles.css` depuis les releases
2. Creez le dossier `gemini-helper` dans `.obsidian/plugins/`
3. Copiez les fichiers et activez dans les parametres Obsidian

### Depuis les Sources
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configuration

### Parametres API
1. Obtenez une cle API depuis [ai.google.dev](https://ai.google.dev)
2. Entrez-la dans les parametres du plugin
3. Selectionnez le plan API (Gratuit/Payant)

![Parametres de Base](docs/images/setting_basic.png)

### Parametres de l'Espace de Travail
- **Prompt Systeme** - Instructions additionnelles pour l'IA
- **Limites d'Outils** - Controler les limites d'appels de fonctions

![Limites d'Outils](docs/images/setting_tool_history.png)

### Chiffrement

Protegez votre historique de chat et vos journaux d'execution de workflows par mot de passe separement.

**Configuration :**

1. Definissez un mot de passe dans les parametres du plugin (stocke de maniere securisee via cryptographie a cle publique)

![Configuration initiale du chiffrement](docs/images/setting_initial_encryption.png)

2. Apres la configuration, activez le chiffrement pour chaque type de journal :
   - **Chiffrer l'historique de chat IA** - Chiffre les fichiers de conversation de chat
   - **Chiffrer les journaux d'execution de workflows** - Chiffre les fichiers d'historique de workflows

![Parametres de chiffrement](docs/images/setting_encryption.png)

Chaque parametre peut etre active/desactive independamment.

**Fonctionnalites :**
- **Controles separes** - Choisissez quels journaux chiffrer (chat, workflow, ou les deux)
- **Chiffrement automatique** - Les nouveaux fichiers sont chiffres lors de la sauvegarde selon les parametres
- **Mise en cache du mot de passe** - Entrez le mot de passe une fois par session
- **Visualiseur dedie** - Les fichiers chiffres s'ouvrent dans un editeur securise avec apercu
- **Option de dechiffrement** - Supprimez le chiffrement de fichiers individuels si necessaire

**Fonctionnement :**

```
[Configuration - une fois lors de la definition du mot de passe]
Mot de passe -> Generer paire de cles (RSA) -> Chiffrer cle privee -> Stocker dans les parametres

[Chiffrement - pour chaque fichier]
Contenu du fichier -> Chiffrer avec nouvelle cle AES -> Chiffrer cle AES avec cle publique
-> Sauvegarder : donnees chiffrees + cle privee chiffree (depuis les parametres) + salt

[Dechiffrement]
Mot de passe + salt -> Restaurer cle privee -> Dechiffrer cle AES -> Dechiffrer contenu
```

- La paire de cles est generee une fois (la generation RSA est lente), la cle AES est generee par fichier
- Chaque fichier stocke : contenu chiffre + cle privee chiffree (copiee des parametres) + salt
- Les fichiers sont autonomes -- dechiffrables avec juste le mot de passe, sans dependance au plugin

<details>
<summary>Script Python de dechiffrement (cliquez pour developper)</summary>

```python
#!/usr/bin/env python3
"""Dechiffrer les fichiers Gemini Helper sans le plugin."""
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
        raise ValueError("Format de fichier chiffre invalide")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("Cle ou salt manquant dans frontmatter")

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
        print(f"Usage : {sys.argv[0]} <fichier_chiffre>")
        sys.exit(1)
    password = getpass.getpass("Mot de passe : ")
    print(decrypt_file(sys.argv[1], password))
```

Requis : `pip install cryptography`

</details>

> **Avertissement :** Si vous oubliez votre mot de passe, les fichiers chiffres ne peuvent pas etre recuperes. Conservez votre mot de passe en lieu sur.

> **Astuce :** Pour chiffrer tous les fichiers d'un repertoire en une fois, utilisez un workflow. Voir l'exemple "Chiffrer tous les fichiers d'un repertoire" dans [WORKFLOW_NODES_fr.md](docs/WORKFLOW_NODES_fr.md#obsidian-command).

![Processus de chiffrement des fichiers](docs/images/enc.png)

**Avantages de securite :**
- **Protege du chat IA** - Les fichiers chiffres ne peuvent pas etre lus par les operations de coffre de l'IA (outil `read_note`). Cela protege les donnees sensibles comme les cles API d'une exposition accidentelle pendant le chat.
- **Acces workflow avec mot de passe** - Les workflows peuvent lire les fichiers chiffres en utilisant le noeud `note-read`. A l'acces, une boite de dialogue de mot de passe apparait, et le mot de passe est mis en cache pour la session.
- **Stockez les secrets en securite** - Au lieu d'ecrire les cles API directement dans les workflows, stockez-les dans des fichiers chiffres. Le workflow lit la cle a l'execution apres verification du mot de passe.

### Commandes Slash
- Definir des modeles de prompts personnalises declenches par `/`
- Modele et recherche optionnels par commande

![Commandes Slash](docs/images/setting_slash_command.png)

## Prerequis

- Obsidian v0.15.0+
- Cle API Google AI
- Desktop et mobile supportes

## Confidentialite

**Donnees stockees localement :**
- Cle API (stockee dans les parametres Obsidian)
- Historique des chats (fichiers Markdown, optionnellement chiffres)
- Historique d'execution des workflows (optionnellement chiffre)
- Cles de chiffrement (cle privee chiffree avec votre mot de passe)

**Donnees envoyees a Google :**
- Tous les messages de chat et pieces jointes sont envoyes a l'API Google Gemini pour traitement
- Quand le RAG est active, les fichiers du coffre sont uploades vers Google File Search
- Quand la Recherche Web est activee, les requetes sont envoyees a Google Search

**Donnees envoyees a des services tiers :**
- Les noeuds `http` des workflows peuvent envoyer des donnees a n'importe quelle URL specifiee dans le workflow

**Serveurs MCP (optionnel) :**
- Les serveurs MCP (Model Context Protocol) peuvent etre configures dans les parametres du plugin pour les noeuds `mcp` des workflows
- Les serveurs MCP sont des services externes qui fournissent des outils et capacites supplementaires

**Notes de securite :**
- Verifiez les workflows avant de les executer - les noeuds `http` peuvent transmettre des donnees du coffre a des endpoints externes
- Les noeuds `note` des workflows affichent un dialogue de confirmation avant d'ecrire des fichiers (comportement par defaut)
- Les commandes slash avec `confirmEdits: false` appliqueront automatiquement les modifications de fichiers sans afficher les boutons Appliquer/Annuler
- Informations d'identification sensibles : Ne stockez pas de cles API ou de tokens directement dans le YAML des workflows (en-tetes `http`, parametres `mcp`, etc.). Stockez-les plutot dans des fichiers chiffres et utilisez le noeud `note-read` pour les recuperer lors de l'execution. Les workflows peuvent lire les fichiers chiffres avec une demande de mot de passe.

Voir les [Conditions d'Utilisation de Google AI](https://ai.google.dev/terms) pour les politiques de retention des donnees.

## Licence

MIT

## Liens

- [Documentation API Gemini](https://ai.google.dev/docs)
- [Documentation des Plugins Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Support

Si vous trouvez ce plugin utile, pensez a m'offrir un cafe !

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
