// French translations
export const fr: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "Skills externes",

  // Settings - API
  "settings.googleApiKey": "Clé API Google",
  "settings.googleApiKey.desc": "Votre clé API de ai.google.dev. Elle est conservée dans le stockage secret local de cet appareil et doit être saisie séparément sur chaque appareil synchronisé.",
  "settings.googleApiKey.missingOnDevice": "Une clé API Google est configurée pour ce coffre, mais elle n'est pas enregistrée sur cet appareil. Saisissez-la dans les réglages de Gemini Helper.",
  "settings.apiPlan": "Plan API",
  "settings.apiPlan.desc": "Sélectionnez le type de plan pour votre clé API (affecte les modèles et fonctions de recherche)",
  "settings.apiPlan.paid": "Payant",
  "settings.apiPlan.free": "Gratuit",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "Dossiers accessibles automatiquement par l'IA",
  "settings.aiVaultToolAllowedFolders.desc": "Facultatif : s'il y a des dossiers que vous ne voulez pas que l'IA lise automatiquement, indiquez uniquement les dossiers auxquels l'IA peut accéder.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "Les dossiers doivent être des chemins relatifs au coffre et ne peuvent pas contenir de segments '.' ou '..'.",
  "settings.aiVaultToolAllowedFolders.placeholder": "Ex. : public, shared/docs",
  "settings.externalSkillsRepository": "Dépôt source",
  "settings.externalSkillsRepository.desc": "Les skills sont importés depuis le dépôt officiel {{repo}} et copiés dans le dossier skills/ du vault. Chaque skill doit inclure un manifest.json.",
  "settings.externalSkills.retry": "Réessayer",
  "settings.externalSkills.loading": "Chargement des skills disponibles…",
  "settings.externalSkills.loadFailed": "Échec du chargement des skills : {{error}}",
  "settings.externalSkills.noSkills": "Aucun skill compatible trouvé dans le dépôt officiel.",
  "settings.externalSkills.allInstalled": "Tous les skills disponibles sont déjà installés.",
  "settings.externalSkills.install": "Installer un skill",
  "settings.externalSkills.install.desc": "Sélectionnez un skill dans le dépôt officiel et installez-le.",
  "settings.externalSkills.installButton": "Installer",
  "settings.externalSkills.installSkipped": "Impossible d'installer {{id}} : {{reason}}",
  "settings.externalSkills.installed": "Skills installés",
  "settings.externalSkills.noVersion": "Aucune version",
  "settings.externalSkills.updateAvailable": "Mise à jour disponible",
  "settings.externalSkills.check": "Rechercher des mises à jour",
  "settings.externalSkills.upToDate": "Déjà à jour (v{{version}}).",
  "settings.externalSkills.notInCatalog": "Ce skill n'est pas dans le dépôt officiel.",
  "settings.externalSkills.updateConfirm": "Mettre à jour {{name}} de v{{from}} vers v{{to}} ?",
  "settings.importSkills": "Importer des skills",
  "settings.importSkills.done": "{{skills}} skill(s), {{files}} fichier(s) importés",
  "settings.importSkills.failed": "Échec de l'import des skills : {{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "Mode de stockage",
  "settings.storeMode.desc": "Interne : synchronise les fichiers du vault. Externe : utilise un store existant.",
  "settings.storeModeInternal": "Interne (sync vault)",
  "settings.storeModeExternal": "Externe (store existant)",
  "settings.storeIds": "IDs de store de recherche sémantique",
  "settings.storeIds.desc": "IDs de store externe (un par ligne)",
  "settings.storeIds.placeholder": "Ex., fileSearchStores/xxx",
  "settings.storeCount": "Nombre de stores",
  "settings.storeCountDesc": "{{count}} store(s) configuré(s)",
  "settings.currentStoreId": "ID de store actuel",
  "settings.copyStoreId": "Copier l'ID de store",
  "settings.storeIdCopied": "ID de store copié dans le presse-papiers",
  "settings.metadataFilter": "Filtre de métadonnées",
  "settings.metadataFilter.desc": "Filtre de métadonnées facultatif appliqué au moment de la requête, avec des métadonnées de synchronisation interne telles que path, extension, basename, folder, modified et size",
  "settings.metadataFilter.placeholder": "Filtrer par extension ou dossier",
  "settings.metadataFilter.help": "Afficher la syntaxe du filtre de métadonnées",
  "settings.metadataFilter.helpTitle": "Syntaxe du filtre de métadonnées",
  "settings.metadataFilter.helpIntro": "Les filtres de métadonnées limitent les résultats de la recherche de fichiers au moment de la requête. Utilisez des comparaisons de chaînes, des comparaisons numériques et and/or pour combiner les conditions.",
  "settings.metadataFilter.helpKeys": "Métadonnées disponibles",
  "settings.metadataFilter.helpKeyPath": "Chemin du fichier relatif au vault",
  "settings.metadataFilter.helpKeyExtension": "Extension de fichier en minuscules",
  "settings.metadataFilter.helpKeyBasename": "Nom du fichier sans extension",
  "settings.metadataFilter.helpKeyFolder": "Chemin du dossier parent",
  "settings.metadataFilter.helpKeyModified": "Date de modification en millisecondes d'époque unix",
  "settings.metadataFilter.helpKeySize": "Taille du fichier en octets",
  "settings.metadataFilter.helpExamples": "Exemples",
  "settings.metadataFilter.helpNote": "La valeur modified utilise des horodatages en millisecondes. Convertissez les dates en millisecondes avant de les utiliser.",

  // Settings - Sync
  "settings.syncVault": "Synchroniser le vault",
  "settings.syncStatus": "{{count}} fichiers indexés | Dernière sync : {{lastSync}}",
  "settings.syncing": "Synchronisation...",
  "settings.syncUploading": "Téléversement",
  "settings.syncSkipping": "Ignore",
  "settings.syncDeleting": "Suppression",
  "settings.syncResult": "Sync : {{uploaded}} téléversés, {{skipped}} ignorés, {{deleted}} supprimés",
  "settings.resetSyncState": "Réinitialiser l'état de sync",
  "settings.resetSyncState.desc": "Effacer l'état de sync local. La prochaine sync re-téléversera tous les fichiers.",
  "settings.resetSyncStateConfirm": "Êtes-vous sûr de vouloir réinitialiser l'état de sync ?",
  "settings.deleteStore": "Supprimer le store de recherche sémantique",
  "settings.deleteStore.desc": "Supprimer le store actuel et toutes les données indexées du serveur",
  "settings.deleteStoreConfirm": "Êtes-vous sûr de vouloir supprimer le store ? Toutes les données indexées seront supprimées du serveur. Cette action est irréversible.",
  "settings.storeDeleted": "Store de recherche sémantique supprimé",
  "settings.deleteStoreFailed": "Échec de la suppression du store : {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "Voir les fichiers",
  "settings.ragFiles.title": "Fichiers dans {{name}}",
  "settings.ragFiles.searchPlaceholder": "Rechercher des fichiers...",
  "settings.ragFiles.filterAll": "Tous",
  "settings.ragFiles.filterRegistered": "Enregistrés",
  "settings.ragFiles.filterPending": "En attente",
  "settings.ragFiles.noFiles": "Aucun fichier trouvé",
  "settings.ragFiles.registered": "Enregistré",
  "settings.ragFiles.pending": "En attente",
  "settings.ragFiles.fileCount": "{{count}} fichiers",

  // Common buttons
  "common.ok": "OK",
  "common.error": "Erreur : ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "Le nom ne peut pas être vide",
  "modal.name": "Nom",
  "modal.enterName": "Entrez le nom",

  // Chat
  "chat.savedAsNote": "Sauvegardé sous {{path}}",
  "chat.chatDeleted": "Chat supprimé",
  "chat.rateLimitPaid": "Ce modèle peut être limité en débit. Essayez un autre modèle jusqu'à demain.",
  "chat.extendToolLimitTitle": "Étendre la limite d'appels d'outils ?",
  "chat.extendToolLimitMessage": "Il reste {{remaining}} appels d'outils à l'assistant ({{used}}/{{currentLimit}} utilisés). Ajouter d'autres appels pour cette réponse ?",
  "chat.extendToolLimitInput": "Appels d'outils supplémentaires",
  "chat.extendToolLimitConfirm": "Ajouter des appels",
  "chat.errorOccurred": "Désolé, une erreur s'est produite : {{message}}",
  "chat.unknownError": "Erreur inconnue",
  "chat.helpTitle": "Aide Gemini Helper",
  "chat.helpDescription": "Activez le bundle de connaissances d'aide intégré et posez des questions sur les fonctionnalités, paramètres, workflows, recherche, tableaux de bord et dépannage de Gemini Helper.",
  "chat.askGeminiHelperHelp": "Poser une question sur Gemini Helper",
  "chat.helpQuestionDraft": "Que peut faire Gemini Helper ?",
  "chat.yesterday": "Hier",

  // InputArea
  "okf.builtinHelpDescription": "Référence intégrée des fonctionnalités de Gemini Helper",
  "input.knowledgeLabel": "Sources de connaissances",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.generation.outputPathTaken": "{{path}} contient déjà un workflow. Choisissez un autre chemin de sortie.",
  "workflow.multipleBlocksInFile": "Plusieurs blocs de workflow trouvés dans un seul fichier. Chaque fichier ne peut contenir qu'un seul workflow ; divisez le fichier manuellement ou utilisez l'action de migration.",
  "workflow.noCodeBlockFound": "Aucun bloc de code de workflow trouvé",
  "workflow.migrateConfirm": "Ce fichier contient plusieurs blocs de workflow. Diviser {{count}} d'entre eux dans de nouveaux fichiers frères ?\n\n{{files}}\n\nLe fichier d'origine conserve le premier workflow. Les capacités de skill, raccourcis clavier ou déclencheurs d'événements qui référençaient le chemin du fichier d'origine restent attachés au premier workflow — pointez-les manuellement vers les nouveaux fichiers si nécessaire.",
  "workflow.migrateNothingToDo": "Ce fichier ne contient pas plusieurs blocs de workflow.",
  "workflow.migrateSuccess": "Migration terminée : {{count}} workflow(s) divisés en fichiers frères.",

  // Common - Edit

  // Edit Confirmation Modal

  // Value Prompt Modal

  // Dialog Prompt Modal (titles passed dynamically)

  // Edit History

  // Workflow Modals

  // Edit History Modal

  // Diff Modal

  // Edit History Buttons

  // Status bar

  // Commands

  // Workflow Selector Modal

  // Errors

  // Encryption
  "settings.encryption": "Chiffrement",
  "settings.encryptChatHistory": "Chiffrer l'historique de chat IA",
  "settings.encryptChatHistory.desc": "Chiffrer les fichiers d'historique de chat IA. Mot de passe requis pour voir le contenu.",
  "settings.encryptWorkflowHistory": "Chiffrer les journaux d'exécution de workflows",
  "settings.encryptWorkflowHistory.desc": "Chiffrer les fichiers de journaux d'exécution de workflows. Mot de passe requis pour voir le contenu.",
  "settings.encryptionSetup": "Configurer le chiffrement",
  "settings.encryptionSetup.desc": "Générer les clés de chiffrement. Vous pouvez chiffrer sans mot de passe, mais le mot de passe est nécessaire pour déchiffrer.",
  "settings.encryptionSetupBtn": "Générer les clés de chiffrement",
  "settings.encryptionPassword": "Mot de passe de chiffrement",
  "settings.encryptionPassword.desc": "Mot de passe pour protéger la clé privée. Requis pour le déchiffrement.",
  "settings.encryptionPassword.placeholder": "Entrez le mot de passe",
  "settings.encryptionConfirmPassword": "Confirmer le mot de passe",
  "settings.encryptionConfirmPassword.placeholder": "Confirmez le mot de passe",
  "settings.encryptionPasswordMismatch": "Les mots de passe ne correspondent pas",
  "settings.encryptionSetupSuccess": "Clés de chiffrement générées avec succès",
  "settings.encryptionSetupFailed": "Échec de la configuration du chiffrement : {{error}}",
  "settings.encryptionConfigured": "Chiffrement configuré",
  "settings.encryptionConfigured.desc": "Les clés de chiffrement sont en place. Choisissez les journaux à chiffrer ci-dessous.",
  "settings.encryptionResetKeys": "Réinitialiser les clés de chiffrement",
  "settings.encryptionResetKeys.desc": "Générer de nouvelles clés de chiffrement. Les chats précédemment chiffrés ne seront plus lisibles.",
  "settings.encryptionResetKeysConfirm": "Réinitialiser les clés de chiffrement ? Tout l'historique de chat précédemment chiffré deviendra illisible.",
  "settings.encryptionKeysReset": "Les clés de chiffrement ont été réinitialisées",

  // Decryption
  "chat.encryptedChat": "Chat chiffré",
  "chat.decryptFailed": "Échec du déchiffrement. Vérifiez votre mot de passe.",
  "chat.decrypted": "Déchiffré avec succès",

  // Workflow Generation Modal

  // Workflow Preview Modal

  // Workflow Confirm Modal

  // Execution History Select Modal

  // Workflow Execution Modal

  // CryptView - File Encryption

  // MCP Server Settings

  // Input - MCP tool hint

  // Skills Settings

  // Skills UI

  // HTML Preview Modal

  // AI Workflow Modal
  "aiWorkflow.pastePlaceholder": "Coller le markdown (avec des blocs ```workflow) ou le YAML de Claude, GPT, etc...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};
