# GemiHub Connection (Google Drive Sync)

Synchronisez votre coffre Obsidian avec Google Drive, entièrement compatible avec [GemiHub](https://gemihub.online). Modifiez des notes dans Obsidian et accédez-y depuis l'interface web de GemiHub, ou inversement.

## Qu'est-ce que GemiHub ?

[GemiHub](https://gemihub.online) est une application web qui transforme Google Gemini en assistant IA personnel intégré à votre Google Drive.

![Interface GemiHub](images/gemihub_connection/push_pull.png)

### Fonctionnalités exclusives à GemiHub

Ces fonctionnalités sont uniquement disponibles via l'interface web de GemiHub et ne peuvent pas être reproduites par le plugin Obsidian seul :

- **Automatic RAG** - Les fichiers synchronisés vers GemiHub sont automatiquement indexés pour la recherche sémantique. Contrairement à la synchronisation RAG manuelle du plugin Obsidian, GemiHub indexe les fichiers à chaque synchronisation sans configuration supplémentaire.
- **OAuth2-enabled MCP** - Utilisez des serveurs MCP nécessitant une authentification OAuth2 (ex. Google Calendar, Gmail, Google Docs). Le plugin Obsidian ne prend en charge que l'authentification MCP basée sur les en-têtes.
- **Conversion Markdown vers PDF/HTML** - Convertissez vos notes Markdown en documents PDF ou HTML formatés directement dans GemiHub.
- **Publication publique** - Publiez des documents HTML/PDF convertis avec une URL publique partageable, facilitant le partage de notes à l'extérieur.

### Fonctionnalités ajoutées à Obsidian via la connexion

En activant la synchronisation Google Drive, ces fonctionnalités deviennent disponibles côté Obsidian :

- **Synchronisation bidirectionnelle avec aperçu des différences** - Push et pull de fichiers avec une liste détaillée des fichiers et une vue diff unifiée avant de valider les modifications
- **Résolution de conflits avec diff** - Lorsque le même fichier est modifié des deux côtés, un modal de conflit affiche un diff unifié avec code couleur pour vous aider à choisir quelle version conserver
- **Historique d'édition Drive** - Suivez les modifications effectuées depuis Obsidian et GemiHub, avec un historique par fichier indiquant l'origine (local/distant)
- **Gestion des sauvegardes de conflits** - Parcourez, prévisualisez et restaurez les sauvegardes de conflits stockées sur Drive

## Aperçu de la Synchronisation

- **Synchronisation bidirectionnelle** - Push des modifications locales vers Drive, pull des modifications distantes vers Obsidian
- **Compatible GemiHub** - Utilise le même format `_sync-meta.json` et l'authentification chiffrée de GemiHub
- **Résolution de conflits** - Détecte et résout les conflits lorsque les deux côtés modifient le même fichier
- **Synchronisation sélective** - Excluez des fichiers/dossiers avec des patterns de correspondance
- **Support des fichiers binaires** - Synchronise les images, PDFs et autres fichiers binaires

## Prérequis

Vous avez besoin d'un compte [GemiHub](https://gemihub.online) avec la synchronisation Google Drive configurée. Le plugin utilise le jeton d'authentification chiffré de GemiHub pour se connecter à votre Google Drive.

1. Connectez-vous à GemiHub
2. Allez dans **Settings** → section **Obsidian Sync**
3. Copiez le **Migration Tool token**

![Migration Tool Token](images/gemihub_connection/migration_tool.png)

## Configuration

1. Ouvrez Obsidian **Paramètres** → **Gemini Helper** → faites défiler jusqu'à **Google Drive sync**
2. Activez **Enable drive sync**

![Activer la synchronisation Drive](images/gemihub_connection/setting_drive_sync.png)

3. Collez le **Migration Tool token** de GemiHub
4. Cliquez sur **Setup** pour récupérer l'authentification chiffrée depuis Google Drive

![Configuration du Migration Tool Token](images/gemihub_connection/setting_migration_tool_token.png)

5. Entrez votre **mot de passe** pour déverrouiller la synchronisation pour la session en cours

![Déverrouillage Drive Sync](images/gemihub_connection/start_with_sync.png)

> À chaque redémarrage d'Obsidian, vous serez invité à entrer votre mot de passe pour déverrouiller la session de synchronisation.

## Fonctionnement de la Synchronisation

### Stockage des Fichiers sur Drive

Tous les fichiers du coffre sont stockés **à plat** dans le dossier racine sur Drive. Le nom de fichier sur Drive inclut le chemin complet du coffre :

| Chemin dans le coffre | Nom de fichier sur Drive |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

Cela signifie qu'il n'y a pas de sous-dossiers sur Drive (à l'exception des dossiers système comme `trash/`, `sync_conflicts/`, `__TEMP__/`). GemiHub utilise la même structure à plat.

### Métadonnées de Synchronisation

Deux fichiers de métadonnées suivent l'état de la synchronisation :

- **`_sync-meta.json`** (sur Drive) - Partagé avec GemiHub. Contient les identifiants de fichiers, les checksums et les horodatages pour tous les fichiers synchronisés.
- **`{workspaceFolder}/drive-sync-meta.json`** (local) - Associe les chemins du coffre aux identifiants de fichiers Drive et stocke les checksums de la dernière synchronisation.

### Push

Uploade les modifications locales vers Google Drive.

1. Calcule les checksums MD5 de tous les fichiers du coffre
2. Compare avec les métadonnées de synchronisation locales pour trouver les fichiers modifiés
3. Si des modifications distantes sont en attente, le push est rejeté (faites un pull d'abord)
4. Uploade les fichiers nouveaux/modifiés vers Drive
5. Déplace les fichiers supprimés localement vers `trash/` sur Drive (suppression douce)
6. Met à jour `_sync-meta.json` sur Drive

![Push vers Drive](images/gemihub_connection/push.png)

### Pull

Télécharge les modifications distantes vers le coffre.

1. Récupère le `_sync-meta.json` distant
2. Calcule les checksums locaux pour détecter les modifications locales
3. En cas de conflits, affiche le modal de résolution de conflits
4. Supprime les fichiers uniquement locaux (déplacés vers la corbeille Obsidian)
5. Télécharge les fichiers distants nouveaux/modifiés vers le coffre
6. Met à jour les métadonnées de synchronisation locales

![Pull vers local](images/gemihub_connection/pull_to_local.png)

### Full Pull

Remplace tous les fichiers locaux par les versions distantes. Utilisez ceci pour réinitialiser votre coffre afin qu'il corresponde à Drive.

> **Attention :** Cela supprime les fichiers locaux absents sur Drive (déplacés vers la corbeille Obsidian).

### Résolution de Conflits

Lorsque le même fichier est modifié à la fois localement et à distance :

- Un modal affiche tous les fichiers en conflit
- Pour chaque fichier, choisissez **Keep local** ou **Keep remote**
- La version non retenue est sauvegardée dans `sync_conflicts/` sur Drive
- **Conflits édition-suppression** (modifié localement, supprimé à distance) proposent **Restore (push to drive)** ou **Accept delete**
- Actions en masse : **Keep all local** / **Keep all remote**

![Résolution des conflits](images/gemihub_connection/conflict.png)

Cliquez sur **Diff** pour voir un diff unifié avec code couleur entre les versions locale et distante :

![Vue diff des conflits](images/gemihub_connection/conflict_diff.png)

## Gestion des Données

### Corbeille

Les fichiers supprimés pendant la synchronisation sont déplacés vers le dossier `trash/` sur Drive au lieu d'être définitivement supprimés. Depuis les paramètres, vous pouvez :

- **Restaurer** - Déplacer les fichiers de la corbeille vers le dossier racine
- **Supprimer définitivement** - Supprimer définitivement les fichiers de Drive

### Sauvegardes de Conflits

Lorsque les conflits sont résolus, la version non retenue est sauvegardée dans `sync_conflicts/` sur Drive. Vous pouvez :

- **Restaurer** - Restaurer une sauvegarde vers le dossier racine (écrase la version actuelle)
- **Supprimer** - Supprimer définitivement les sauvegardes

![Sauvegardes de conflits](images/gemihub_connection/conflict_backup.png)

### Fichiers Temporaires

Les fichiers temporairement sauvegardés par GemiHub sont stockés dans `__TEMP__/` sur Drive. Vous pouvez :

- **Appliquer** - Appliquer le contenu du fichier temporaire au fichier Drive correspondant
- **Supprimer** - Supprimer les fichiers temporaires

Les trois modaux de gestion supportent l'aperçu de fichiers et les opérations par lot.

## Paramètres

| Paramètre | Description | Par défaut |
|---|---|---|
| **Enable drive sync** | Activer/désactiver la fonctionnalité de synchronisation | Désactivé |
| **Migration Tool token** | Collez depuis les paramètres GemiHub (section Obsidian Sync) | - |
| **Auto sync check** | Vérifier périodiquement les modifications distantes et mettre à jour les compteurs | Désactivé |
| **Sync check interval** | Fréquence de vérification (minutes) | 5 |
| **Exclude patterns** | Chemins à exclure (un par ligne, supporte les wildcards `*`) | `node_modules/` |

## Commandes

Quatre commandes sont disponibles depuis la palette de commandes :

| Commande | Description |
|---|---|
| **Drive sync: push to drive** | Push des modifications locales vers Drive |
| **Drive sync: pull to local** | Pull des modifications distantes vers le coffre |
| **Drive sync: full push to drive** | Push de tous les fichiers locaux vers Drive |
| **Drive sync: full pull to local** | Remplacer tous les fichiers locaux par les versions distantes |

## Fichiers Exclus

Les éléments suivants sont toujours exclus de la synchronisation :

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Répertoire de configuration Obsidian (`.obsidian/` ou personnalisé)
- Patterns d'exclusion définis par l'utilisateur dans les paramètres

### Syntaxe des Patterns d'Exclusion

- `folder/` - Exclure un dossier et son contenu
- `*.tmp` - Pattern glob (correspond à tout fichier `.tmp`)
- `*.log` - Pattern glob (correspond à tout fichier `.log`)
- `drafts/` - Exclure le dossier `drafts`

## Dépannage

### "Remote has pending changes. Please pull first."

Le Drive distant a des modifications qui n'ont pas encore été récupérées. Exécutez **Pull to local** avant de faire un push.

### "Drive sync: no remote data found. Push first."

Aucun `_sync-meta.json` n'existe sur Drive. Exécutez **Push to drive** pour initialiser la synchronisation.

### Échec du déverrouillage par mot de passe

- Vérifiez que vous utilisez le même mot de passe que dans GemiHub
- Si vous avez changé votre mot de passe dans GemiHub, utilisez **Reset auth** dans les paramètres et reconfigurez avec un nouveau Migration Tool token

### Le modal de conflits réapparaît constamment

Les deux côtés ont des modifications. Résolvez tous les conflits en choisissant local ou distant pour chaque fichier. Après avoir résolu tous les conflits, le pull continue automatiquement.
