# Gemini Helper pour Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

Assistant IA **gratuit et open-source** pour Obsidian avec **Chat**, **Automatisation de Workflows** et **RAG** propulsé par Google Gemini.

> **Ce plugin est entièrement gratuit.** Vous avez uniquement besoin d'une clé API Google Gemini (gratuite ou payante) depuis [ai.google.dev](https://ai.google.dev).

## Points Forts

- **Chat IA** - Réponses en streaming, pièces jointes, opérations sur le coffre, commandes slash
- **Constructeur de Workflows** - Automatisez des tâches multi-étapes avec l'éditeur visuel de nœuds et 24 types de nœuds
- **Historique d'Édition** - Suivez et restaurez les modifications faites par l'IA avec vue des différences
- **RAG** - Génération Augmentée par Récupération pour une recherche intelligente dans votre coffre
- **Recherche Web** - Accédez à des informations actualisées via Google Search
- **Génération d'Images** - Créez des images avec les modèles d'images Gemini
- **Chiffrement** - Protection par mot de passe de l'historique de chat et des journaux d'exécution des workflows

![Génération d'images dans le chat](docs/images/chat_image.png)

## Clé API

Ce plugin nécessite une clé API Google Gemini. Vous pouvez choisir entre :

| Fonctionnalité | Clé API Gratuite | Clé API Payante |
|----------------|------------------|-----------------|
| Chat basique | ✅ | ✅ |
| Opérations sur le coffre | ✅ | ✅ |
| Recherche Web | ✅ | ✅ |
| RAG | ✅ (limité) | ✅ |
| Workflow | ✅ | ✅ |
| Génération d'images | ❌ | ✅ |
| Modèles | Flash, Gemma | Flash, Pro, Image |
| Coût | **Gratuit** | Paiement à l'usage |

### Conseils pour la Clé API Gratuite

- Les **limites de débit** sont par modèle et se réinitialisent quotidiennement. Changez de modèle pour continuer à travailler.
- La **synchronisation RAG** est limitée. Lancez "Sync Vault" quotidiennement - les fichiers déjà uploadés sont ignorés.
- Les **modèles Gemma** ne supportent pas les opérations sur le coffre dans le Chat, mais les **Workflows peuvent toujours lire/écrire des notes** en utilisant les types de nœuds `note`, `note-read` et autres. Les variables `{content}` et `{selection}` fonctionnent également.

---

# Chat IA

La fonctionnalité Chat IA fournit une interface de conversation interactive avec Google Gemini, intégrée à votre coffre Obsidian.

![Interface de Chat](docs/images/chat.png)

## Commandes Slash

Créez des modèles de prompts réutilisables déclenchés par `/` :

- Définissez des modèles avec `{selection}` (texte sélectionné) et `{content}` (note active)
- Modèle et recherche optionnels personnalisables par commande
- Tapez `/` pour voir les commandes disponibles

**Par défaut :** `/infographic` - Convertit le contenu en infographie HTML

![Exemple d'Infographie](docs/images/chat_infographic.png)

## Mentions @

Référencez des fichiers et variables en tapant `@` :

- `{selection}` - Texte sélectionné
- `{content}` - Contenu de la note active
- N'importe quel fichier du coffre - Parcourez et insérez (chemin uniquement ; l'IA lit le contenu via les outils)

> [!NOTE]
> **Comment fonctionnent `{selection}` et `{content}` :** Lorsque vous passez de la vue Markdown à la vue Chat, la sélection serait normalement effacée en raison du changement de focus. Pour préserver votre sélection, le plugin la capture lors du changement de vue et met en surbrillance la zone sélectionnée avec une couleur d'arrière-plan dans la vue Markdown. L'option `{selection}` n'apparaît dans les suggestions @ que lorsqu'un texte a été sélectionné.
>
> `{selection}` et `{content}` ne sont intentionnellement **pas développés** dans la zone de saisie—comme la zone de saisie du chat est compacte, développer un texte long rendrait la saisie difficile. Le contenu est développé lorsque vous envoyez le message, ce que vous pouvez vérifier en consultant votre message envoyé dans le chat.

> [!NOTE]
> Les mentions @ de fichiers du coffre insèrent uniquement le chemin du fichier - l'IA lit le contenu via les outils. Cela ne fonctionne pas avec les modèles Gemma (pas de support des outils du coffre).

## Pièces Jointes

Joignez des fichiers directement : Images (PNG, JPEG, GIF, WebP), PDFs, Fichiers texte, Audio (MP3, WAV, FLAC, AAC, Opus, OGG), Vidéo (MP4, WebM, MOV, AVI, MKV)

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
| `bulk_propose_rename` | Renommage en masse de plusieurs fichiers avec dialogue de sélection |

### Mode Outils du Coffre

Lorsque l'IA gère des notes dans le Chat, elle utilise les outils du Vault. Contrôlez quels outils du coffre l'IA peut utiliser via l'icône de base de données (📦) sous le bouton de pièce jointe :

| Mode | Description | Outils Disponibles |
|------|-------------|-------------------|
| **Vault: Tous** | Accès complet au coffre | Tous les outils |
| **Vault: Sans recherche** | Exclure les outils de recherche | Tous sauf `search_notes`, `list_notes` |
| **Vault: Désactivé** | Aucun accès au coffre | Aucun |

**Quand utiliser chaque mode :**

- **Vault: Tous** - Mode par défaut pour une utilisation générale. L'IA peut lire, écrire et rechercher dans votre coffre.
- **Vault: Sans recherche** - Utilisez-le lorsque vous souhaitez rechercher uniquement avec RAG, ou lorsque vous connaissez déjà le fichier cible. Cela évite les recherches redondantes dans le vault, économisant des tokens et améliorant le temps de réponse.
- **Vault: Désactivé** - Utilisez-le lorsque vous n'avez pas besoin d'accès au vault du tout.

**Sélection automatique du mode :**

| Condition | Mode Par Défaut | Modifiable |
|-----------|-----------------|------------|
| Modèles Gemma | Vault: Désactivé | Non |
| Web Search activé | Vault: Désactivé | Non |
| RAG activé | Vault: Désactivé | Non |
| Sans RAG | Vault: Tous | Oui |

**Pourquoi certains modes sont forcés :**

- **Modèles Gemma** : Ces modèles ne prennent pas en charge les appels de fonction, donc les outils Vault ne peuvent pas être utilisés.
- **Web Search** : Par conception, les outils Vault sont désactivés lorsque Web Search est activé.
- **RAG activé** : L'API Gemini ne prend pas en charge la combinaison de File Search (RAG) avec les appels de fonction. Lorsque le RAG est activé, les outils Vault et MCP sont automatiquement désactivés.

## Édition Sécurisée

Quand l'IA utilise `propose_edit` :
1. Un dialogue de confirmation affiche les modifications proposées
2. Cliquez sur **Appliquer** pour écrire les modifications dans le fichier
3. Cliquez sur **Annuler** pour annuler sans modifier le fichier

> Les modifications ne sont PAS écrites tant que vous ne confirmez pas.

## Historique d'Édition

Suivez et restaurez les modifications apportées à vos notes :

- **Suivi automatique** - Toutes les modifications IA (chat, workflow) et manuelles sont enregistrées
- **Accès via menu fichier** - Clic droit sur un fichier markdown pour accéder à :
  - **Snapshot** - Sauvegarder l'état actuel comme instantané
  - **History** - Ouvrir le modal d'historique d'édition

![Menu Fichier](docs/images/snap_history.png)

- **Palette de commandes** - Aussi disponible via la commande "Show edit history"
- **Vue des différences** - Voyez exactement ce qui a changé avec ajouts/suppressions codés par couleur
- **Restaurer** - Revenez à n'importe quelle version précédente en un clic
- **Copier** - Enregistre une version historique comme nouveau fichier (nom par défaut : `{filename}_{datetime}.md`)
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

**Stockage :** L'historique des modifications est stocké en mémoire et effacé au redémarrage d'Obsidian. Le suivi persistant des versions est couvert par la récupération de fichiers intégrée d'Obsidian.

**Paramètres :**
- Activer/désactiver dans les paramètres du plugin
- Configurer les lignes de contexte pour les différences

![Modal Historique d'Édition](docs/images/edit_history.png)

## RAG

Génération Augmentée par Récupération pour une recherche intelligente dans le coffre :

- **Fichiers supportés** - Markdown, PDF, Documents Office (Doc, Docx, XLS, XLSX, PPTX)
- **Mode interne** - Synchroniser les fichiers du coffre vers Google File Search
- **Mode externe** - Utiliser des IDs de store existants
- **Synchronisation incrémentale** - Uploader uniquement les fichiers modifiés
- **Dossiers cibles** - Spécifier les dossiers à inclure
- **Patterns d'exclusion** - Patterns regex pour exclure des fichiers

![Paramètres RAG](docs/images/setting_rag.png)

## Serveurs MCP

Les serveurs MCP (Model Context Protocol) fournissent des outils supplémentaires qui étendent les capacités de l'IA au-delà des opérations du vault.

**Configuration :**

1. Ouvrez les paramètres du plugin → section **Serveurs MCP**
2. Cliquez sur **Ajouter un serveur**
3. Entrez le nom et l'URL du serveur
4. Configurez les en-têtes optionnels (format JSON) pour l'authentification
5. Cliquez sur **Tester la connexion** pour vérifier et récupérer les outils disponibles
6. Enregistrez la configuration du serveur

> **Note :** Le test de connexion est obligatoire avant l'enregistrement. Cela garantit que le serveur est accessible et affiche les outils disponibles.

![Paramètres des Serveurs MCP](docs/images/setting_mcp.png)

**Utilisation des outils MCP :**

- **Dans le chat :** Cliquez sur l'icône de base de données (📦) pour ouvrir les paramètres des outils. Activez/désactivez les serveurs MCP par conversation.
- **Dans les workflows :** Utilisez le nœud `mcp` pour appeler les outils du serveur MCP.

**Indices d'outils :** Après un test de connexion réussi, les noms des outils disponibles sont enregistrés et affichés dans les paramètres et l'interface de chat.

### MCP Apps (UI Interactive)

Certains outils MCP retournent une UI interactive qui permet d'interagir visuellement avec les résultats de l'outil. Cette fonctionnalité est basée sur la [spécification MCP Apps](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps).

![MCP Apps](docs/images/mcp_apps.png)

**Comment ça fonctionne :**

- Quand un outil MCP retourne un URI de ressource `ui://` dans les métadonnées de sa réponse, le plugin récupère et affiche le contenu HTML
- L'UI est affichée dans un iframe isolé pour la sécurité (`sandbox="allow-scripts allow-forms"`)
- Les applications interactives peuvent appeler des outils MCP supplémentaires et mettre à jour le contexte via un pont JSON-RPC

**Dans le Chat :**
- MCP Apps apparaît en ligne dans les messages de l'assistant avec un bouton développer/réduire
- Cliquez sur ⊕ pour développer en plein écran, ⊖ pour réduire

**Dans les Workflows :**
- MCP Apps est affiché dans une boîte de dialogue modale pendant l'exécution du workflow
- Le workflow se met en pause pour permettre l'interaction de l'utilisateur, puis continue quand le modal est fermé

> **Sécurité :** Tout le contenu MCP App s'exécute dans un iframe isolé avec des permissions restreintes. L'iframe ne peut pas accéder au DOM de la page parente, aux cookies ou au stockage local. Seuls `allow-scripts` et `allow-forms` sont activés.

## Skills d'Agent

Étendez les capacités de l'IA avec des instructions personnalisées, des documents de référence et des workflows exécutables. Les skills suivent le modèle standard de l'industrie pour les skills d'agent (ex. [OpenAI Codex](https://github.com/openai/codex) `.codex/skills/`).

- **Instructions personnalisées** - Définissez un comportement spécifique au domaine via des fichiers `SKILL.md`
- **Documents de référence** - Incluez des guides de style, modèles et listes de contrôle dans `references/`
- **Intégration des workflows** - Les skills peuvent exposer des workflows comme outils de Function Calling
- **Commande slash** - Tapez `/folder-name` pour invoquer un skill instantanément et envoyer
- **Activation sélective** - Choisissez quels skills sont actifs par conversation

Créez des skills de la même manière que les workflows — sélectionnez **+ New (AI)**, cochez **« Créer en tant qu'agent skill »** et décrivez ce que vous souhaitez. L'AI génère à la fois les instructions du `SKILL.md` et le workflow.

> **Pour les instructions de configuration et des exemples, consultez [SKILLS.md](docs/SKILLS_fr.md)**

---

# Constructeur de Workflows

Construisez des workflows automatisés multi-étapes directement dans les fichiers Markdown. **Aucune connaissance en programmation requise** - décrivez simplement ce que vous voulez en langage naturel, et l'IA créera le workflow pour vous.

![Éditeur Visuel de Workflow](docs/images/visual_workflow.png)

## Création de Workflows et Skills avec l'AI

**Vous n'avez pas besoin d'apprendre la syntaxe YAML ou les types de nœuds.** Décrivez simplement votre workflow en langage courant :

1. Ouvrez l'onglet **Workflow** dans la barre latérale Gemini
2. Sélectionnez **+ Nouveau (IA)** dans le menu déroulant
3. Décrivez ce que vous voulez : *"Créer un workflow qui résume la note sélectionnée et l'enregistre dans un dossier summaries"*
4. Cochez **« Créer en tant qu'agent skill »** si vous souhaitez créer un agent skill au lieu d'un workflow autonome
5. Cliquez sur **Générer** - l'IA crée le workflow complet

![Créer un Workflow avec l'IA](docs/images/create_workflow_with_ai.png)

**Modifiez les workflows existants de la même manière :**
1. Chargez n'importe quel workflow
2. Cliquez sur le bouton **Modifier avec IA**
3. Décrivez les modifications : *"Ajouter une étape pour traduire le résumé en japonais"*
4. Vérifiez et appliquez

![Modification de Workflow par IA](docs/images/modify_workflow_with_ai.png)

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

24 types de nœuds sont disponibles pour construire des workflows :

| Catégorie | Nœuds |
|-----------|-------|
| Variables | `variable`, `set` |
| Contrôle | `if`, `while` |
| LLM | `command` |
| Données | `http`, `json`, `script` |
| Notes | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Fichiers | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composition | `workflow` |
| RAG | `rag-sync` |
| Externe | `mcp`, `obsidian-command` |
| Utilitaire | `sleep` |

> **Pour les spécifications détaillées des nœuds et des exemples, voir [WORKFLOW_NODES_fr.md](docs/WORKFLOW_NODES_fr.md)**

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

![Paramètres de Déclencheur d'Événement](docs/images/event_setting.png)

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
| `_eventType` | Type d'événement : `create`, `modify`, `delete`, `rename`, `file-open` |
| `_eventFilePath` | Chemin du fichier affecté |
| `_eventFile` | JSON avec les infos du fichier (path, basename, name, extension) |
| `_eventFileContent` | Contenu du fichier (pour les événements create/modify/file-open) |
| `_eventOldPath` | Chemin précédent (pour les événements rename uniquement) |

> **Note :** Les nœuds `prompt-file` et `prompt-selection` utilisent automatiquement le fichier de l'événement quand déclenchés par des événements. `prompt-selection` utilise le contenu entier du fichier comme sélection.

---

# Commun

## Modèles Supportés

### Plan Payant
| Modèle | Description |
|--------|-------------|
| Gemini 3.1 Pro Preview | Dernier modèle phare, contexte 1M (recommandé) |
| Gemini 3.1 Pro Preview (Custom Tools) | Optimisé pour les flux de travail agentiques avec outils personnalisés et bash |
| Gemini 3 Flash Preview | Modèle rapide, contexte 1M, meilleur rapport coût-performance |
| Gemini 3.1 Flash Lite Preview | Modèle le plus rentable avec hautes performances |
| Gemini 2.5 Flash | Modèle rapide, contexte 1M |
| Gemini 2.5 Pro | Modèle Pro, contexte 1M |
| Gemini 3 Pro (Image) | Génération d'images Pro, 4K |
| Gemini 3.1 Flash (Image) | Génération d'images rapide et économique |

> **Mode Thinking :** Dans le chat, le mode thinking est déclenché par des mots-clés comme « réfléchis », « analyse » ou « considère » dans votre message. Cependant, **Gemini 3.1 Pro** utilise toujours le mode thinking indépendamment des mots-clés — ce modèle ne permet pas de désactiver le thinking.

**Bascule Always Think :**

Vous pouvez forcer le mode thinking à ON pour les modèles Flash sans utiliser de mots-clés. Cliquez sur l'icône de base de données (📦) pour ouvrir le menu des outils, et cochez les cases sous **Always Think** :

- **Flash** — OFF par défaut. Cochez pour toujours activer le thinking pour les modèles Flash.
- **Flash Lite** — ON par défaut. Flash Lite a une différence de coût et de vitesse minimale avec le thinking activé, il est donc recommandé de le garder activé.

Quand une bascule est ON, le thinking est toujours actif pour cette famille de modèles indépendamment du contenu du message. Quand elle est OFF, la détection basée sur les mots-clés existante est utilisée.

![Always Think Settings](docs/images/setting_thinking.png)

### Plan Gratuit
| Modèle | Opérations sur le Coffre |
|--------|--------------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemini 3.1 Flash Lite Preview | ✅ |
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

![Paramètres de Base](docs/images/setting_basic.png)

### Paramètres de l'Espace de Travail
- **Prompt Système** - Instructions additionnelles pour l'IA
- **Limites d'Outils** - Contrôler les limites d'appels de fonctions
- **Historique d'Édition** - Suivez et restaurez les modifications faites par l'IA

![Limite d'Outils & Historique d'Édition](docs/images/setting_tool_history.png)

### Chiffrement

Protégez votre historique de chat et vos journaux d'exécution de workflows par mot de passe séparément.

**Configuration :**

1. Définissez un mot de passe dans les paramètres du plugin (stocké de manière sécurisée via cryptographie à clé publique)

![Configuration initiale du chiffrement](docs/images/setting_initial_encryption.png)

2. Après la configuration, activez le chiffrement pour chaque type de journal :
   - **Chiffrer l'historique de chat IA** - Chiffre les fichiers de conversation de chat
   - **Chiffrer les journaux d'exécution de workflows** - Chiffre les fichiers d'historique de workflows

![Paramètres de chiffrement](docs/images/setting_encryption.png)

Chaque paramètre peut être activé/désactivé indépendamment.

**Fonctionnalités :**
- **Contrôles séparés** - Choisissez quels journaux chiffrer (chat, workflow, ou les deux)
- **Chiffrement automatique** - Les nouveaux fichiers sont chiffrés lors de la sauvegarde selon les paramètres
- **Mise en cache du mot de passe** - Entrez le mot de passe une fois par session
- **Visualiseur dédié** - Les fichiers chiffrés s'ouvrent dans un éditeur sécurisé avec aperçu
- **Option de déchiffrement** - Supprimez le chiffrement de fichiers individuels si nécessaire

**Fonctionnement :**

```
[Configuration - une fois lors de la définition du mot de passe]
Mot de passe → Générer paire de clés (RSA) → Chiffrer clé privée → Stocker dans les paramètres

[Chiffrement - pour chaque fichier]
Contenu du fichier → Chiffrer avec nouvelle clé AES → Chiffrer clé AES avec clé publique
→ Sauvegarder : données chiffrées + clé privée chiffrée (depuis les paramètres) + salt

[Déchiffrement]
Mot de passe + salt → Restaurer clé privée → Déchiffrer clé AES → Déchiffrer contenu
```

- La paire de clés est générée une fois (la génération RSA est lente), la clé AES est générée par fichier
- Chaque fichier stocke : contenu chiffré + clé privée chiffrée (copiée des paramètres) + salt
- Les fichiers sont autonomes — déchiffrables avec juste le mot de passe, sans dépendance au plugin

<details>
<summary>Script Python de déchiffrement (cliquez pour développer)</summary>

```python
#!/usr/bin/env python3
"""Déchiffrer les fichiers Gemini Helper sans le plugin."""
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
        raise ValueError("Format de fichier chiffré invalide")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("Clé ou salt manquant dans frontmatter")

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
        print(f"Usage : {sys.argv[0]} <fichier_chiffré>")
        sys.exit(1)
    password = getpass.getpass("Mot de passe : ")
    print(decrypt_file(sys.argv[1], password))
```

Requis : `pip install cryptography`

</details>

> **Avertissement :** Si vous oubliez votre mot de passe, les fichiers chiffrés ne peuvent pas être récupérés. Conservez votre mot de passe en lieu sûr.

> **Astuce :** Pour chiffrer tous les fichiers d'un répertoire en une fois, utilisez un workflow. Voir l'exemple "Chiffrer tous les fichiers d'un répertoire" dans [WORKFLOW_NODES_fr.md](docs/WORKFLOW_NODES_fr.md#obsidian-command).

![Processus de chiffrement des fichiers](docs/images/enc.png)

**Avantages de sécurité :**
- **Protégé du chat IA** - Les fichiers chiffrés ne peuvent pas être lus par les opérations de coffre de l'IA (outil `read_note`). Cela protège les données sensibles comme les clés API d'une exposition accidentelle pendant le chat.
- **Accès workflow avec mot de passe** - Les workflows peuvent lire les fichiers chiffrés en utilisant le nœud `note-read`. À l'accès, une boîte de dialogue de mot de passe apparaît, et le mot de passe est mis en cache pour la session.
- **Stockez les secrets en sécurité** - Au lieu d'écrire les clés API directement dans les workflows, stockez-les dans des fichiers chiffrés. Le workflow lit la clé à l'exécution après vérification du mot de passe.

### Commandes Slash
- Définir des modèles de prompts personnalisés déclenchés par `/`
- Modèle et recherche optionnels par commande

![Commandes Slash](docs/images/setting_slash_command.png)

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

**Depuis la Barre Latérale :**
1. Ouvrez l'onglet **Workflow** dans la barre latérale
2. Ouvrez un fichier avec un bloc de code `workflow`
3. Sélectionnez le workflow dans le menu déroulant (ou choisissez **Browse all workflows** pour rechercher tous les workflows du coffre)
4. Cliquez sur **Exécuter** pour lancer
5. Cliquez sur **Historique** pour voir les exécutions passées

**Depuis la Palette de Commandes (Run Workflow) :**

Utilisez la commande "Gemini Helper: Run Workflow" pour parcourir et exécuter des workflows depuis n'importe où :

1. Ouvrez la palette de commandes et recherchez "Run Workflow"
2. Parcourez tous les fichiers du vault contenant des blocs de code workflow (les fichiers du dossier `workflows/` sont affichés en premier)
3. Prévisualisez le contenu du workflow et l'historique de génération par IA
4. Sélectionnez un workflow et cliquez sur **Run** pour exécuter

![Modal Exécuter Workflow](docs/images/workflow_list.png)

Ceci est utile pour exécuter rapidement des workflows sans naviguer d'abord vers le fichier du workflow.

![Historique des Workflows](docs/images/workflow_history.png)

**Visualiser comme Organigramme :** Cliquez sur le bouton **Canvas** (icône grille) dans le panneau Workflow pour exporter votre workflow sous forme de Canvas Obsidian. Cela crée un organigramme visuel où :
- Les boucles et les branches sont clairement affichées avec un routage approprié
- Les nœuds de décision (`if`/`while`) affichent les chemins Oui/Non
- Les flèches de retour sont acheminées autour des nœuds pour plus de clarté
- Chaque nœud affiche sa configuration complète
- Un lien vers le fichier workflow source est inclus pour une navigation rapide

![Workflow to Canvas](docs/images/workflow_to_canvas.png)

C'est particulièrement utile pour comprendre les workflows complexes avec plusieurs branches et boucles.

**Exporter l'historique d'exécution :** Visualisez l'historique d'exécution sous forme de Canvas Obsidian pour une analyse visuelle. Cliquez sur **Open Canvas view** dans le modal Historique pour créer un fichier Canvas.

> **Remarque :** Les fichiers Canvas sont créés dynamiquement dans le dossier workspace. Supprimez-les manuellement après examen s'ils ne sont plus nécessaires.

![Vue Canvas de l'Historique](docs/images/history_canvas.png)

### Génération de Workflows par IA

**Créer un Nouveau Workflow avec l'IA :**
1. Sélectionnez **+ Nouveau (IA)** dans le menu déroulant des workflows
2. Entrez le nom du workflow et le chemin de sortie (supporte la variable `{{name}}`)
3. Décrivez ce que le workflow doit faire en langage naturel
4. Sélectionnez un modèle et cliquez sur **Générer**
5. Le workflow est automatiquement créé et sauvegardé

> **Astuce :** Lors de l'utilisation de **+ Nouveau (IA)** depuis le menu déroulant sur un fichier qui contient déjà des workflows, le chemin de sortie est défini par défaut sur le fichier actuel. Le workflow généré sera ajouté à ce fichier.

**Créer un workflow depuis n'importe quel fichier :**

Lors de l'ouverture de l'onglet Workflow avec un fichier qui n'a pas de bloc de code workflow, un bouton **« Create workflow with AI »** est affiché. Cliquez dessus pour générer un nouveau workflow (sortie par défaut : `workflows/{{name}}.md`).

**Références de Fichiers avec @ :**

Tapez `@` dans le champ de description pour référencer des fichiers :
- `@{selection}` - Sélection actuelle de l'éditeur
- `@{content}` - Contenu de la note active
- `@path/to/file.md` - N'importe quel fichier du vault

Lorsque vous cliquez sur Générer, le contenu du fichier est intégré directement dans la requête IA. Le frontmatter YAML est automatiquement supprimé.

> **Conseil :** Ceci est utile pour créer des workflows basés sur des exemples ou modèles de workflow existants dans votre vault.

**Pièces Jointes :**

Cliquez sur le bouton de pièce jointe pour joindre des fichiers (images, PDFs, fichiers texte) à votre demande de génération de workflow. Ceci est utile pour fournir un contexte visuel ou des exemples à l'IA.

**Utiliser des LLMs Externes (Copier le Prompt / Coller la Réponse) :**

Vous pouvez utiliser n'importe quel LLM externe (Claude, GPT, etc.) pour générer des workflows :

1. Remplissez le nom et la description du workflow comme d'habitude
2. Cliquez sur **Copy Prompt** - le prompt complet est copié dans le presse-papiers
3. Collez le prompt dans votre LLM préféré
4. Copiez la réponse du LLM
5. Collez-la dans la zone de texte **Coller la Réponse** qui apparaît
6. Cliquez sur **Appliquer** pour créer le workflow

La réponse collée peut être du YAML brut ou un document Markdown complet avec des blocs de code `` ```workflow ``. Les réponses Markdown sont enregistrées telles quelles, préservant toute documentation incluse par le LLM.

**Contrôles du Modal :**

Le modal de workflow IA supporte le positionnement par glisser-déposer et le redimensionnement depuis les coins pour une meilleure expérience d'édition.

**Historique des Requêtes :**

Chaque workflow généré par IA enregistre une entrée d'historique au-dessus du bloc de code du workflow, incluant :
- Horodatage et action (Créé/Modifié)
- Votre description de la requête
- Contenus des fichiers référencés (dans des sections repliables)

![Historique IA du Workflow](docs/images/workflow_ai_history.png)

**Modifier un Workflow Existant avec l'IA :**
1. Chargez un workflow existant
2. Cliquez sur le bouton **Modifier avec IA** (icône étincelle)
3. Décrivez les modifications souhaitées
4. Vérifiez la comparaison avant/après
5. Cliquez sur **Appliquer les Modifications** pour mettre à jour

![Modification de Workflow par IA](docs/images/modify_workflow_with_ai.png)

**Référence à l'Historique d'Exécution :**

Lors de la modification d'un workflow avec l'IA, vous pouvez faire référence aux résultats d'exécution précédents pour aider l'IA à comprendre les problèmes :

1. Cliquez sur le bouton **Référencer l'historique d'exécution**
2. Sélectionnez une exécution dans la liste (les exécutions en erreur sont surlignées)
3. Choisissez les étapes à inclure (les étapes en erreur sont présélectionnées)
4. L'IA reçoit les données d'entrée/sortie de l'étape pour comprendre ce qui a mal tourné

C'est particulièrement utile pour déboguer les workflows - vous pouvez dire à l'IA "Corrige l'erreur à l'étape 2" et elle verra exactement quelle entrée a causé l'échec.

**Historique des Requêtes :**

Lors de la régénération d'un workflow (en cliquant sur "Non" dans l'aperçu), toutes les requêtes précédentes de la session sont transmises à l'IA. Cela aide l'IA à comprendre le contexte complet de vos modifications sur plusieurs itérations.

**Édition Manuelle de Workflow :**

Éditez les workflows directement dans l'éditeur visuel de nœuds avec interface glisser-déposer.

![Édition Manuelle de Workflow](docs/images/modify_workflow_manual.png)

**Recharger depuis le Fichier :**
- Sélectionnez **Recharger depuis le fichier** dans le menu déroulant pour réimporter le workflow depuis le fichier markdown

## Prérequis

- Obsidian v0.15.0+
- Clé API Google AI
- Desktop et mobile supportés

## Confidentialité

**Données stockées localement :**
- Clé API (stockée dans les paramètres Obsidian)
- Historique des chats (fichiers Markdown, optionnellement chiffrés)
- Historique d'exécution des workflows (optionnellement chiffré)
- Clés de chiffrement (clé privée chiffrée avec votre mot de passe)

**Données envoyées à Google :**
- Tous les messages de chat et pièces jointes sont envoyés à l'API Google Gemini pour traitement
- Quand le RAG est activé, les fichiers du coffre sont uploadés vers Google File Search
- Quand la Recherche Web est activée, les requêtes sont envoyées à Google Search

**Données envoyées à des services tiers :**
- Les nœuds `http` des workflows peuvent envoyer des données à n'importe quelle URL spécifiée dans le workflow

**Serveurs MCP (optionnel) :**
- Les serveurs MCP (Model Context Protocol) peuvent être configurés dans les paramètres du plugin pour les nœuds `mcp` des workflows
- Les serveurs MCP sont des services externes qui fournissent des outils et capacités supplémentaires

**Notes de sécurité :**
- Vérifiez les workflows avant de les exécuter - les nœuds `http` peuvent transmettre des données du coffre à des endpoints externes
- Les nœuds `note` des workflows affichent un dialogue de confirmation avant d'écrire des fichiers (comportement par défaut)
- Les commandes slash avec `confirmEdits: false` appliqueront automatiquement les modifications de fichiers sans afficher les boutons Appliquer/Annuler
- Informations d'identification sensibles : Ne stockez pas de clés API ou de tokens directement dans le YAML des workflows (en-têtes `http`, paramètres `mcp`, etc.). Stockez-les plutôt dans des fichiers chiffrés et utilisez le nœud `note-read` pour les récupérer lors de l'exécution. Les workflows peuvent lire les fichiers chiffrés avec une demande de mot de passe.

Voir les [Conditions d'Utilisation de Google AI](https://ai.google.dev/terms) pour les politiques de rétention des données.

## Licence

MIT

## Liens

- [Documentation API Gemini](https://ai.google.dev/docs)
- [Documentation des Plugins Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Support

Si vous trouvez ce plugin utile, pensez à m'offrir un café !

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
