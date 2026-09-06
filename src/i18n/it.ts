// Italian translations
export const it: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "Skill esterni",

  // Settings - API
  "settings.googleApiKey": "Chiave API Google",
  "settings.googleApiKey.desc": "La tua chiave API da ai.google.dev. Viene salvata nell'archivio segreto locale di questo dispositivo e deve essere inserita separatamente su ogni dispositivo sincronizzato.",
  "settings.googleApiKey.missingOnDevice": "Per questo vault è configurata una chiave API Google, ma non è salvata su questo dispositivo. Inseriscila nelle impostazioni di Gemini Helper.",
  "settings.apiPlan": "Piano API",
  "settings.apiPlan.desc": "Seleziona il tipo di piano per la tua chiave API (influisce sui modelli e funzioni di ricerca)",
  "settings.apiPlan.paid": "A pagamento",
  "settings.apiPlan.free": "Gratuito",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "Cartelle a cui l'IA può accedere automaticamente",
  "settings.aiVaultToolAllowedFolders.desc": "Facoltativo: se ci sono directory che non vuoi far leggere automaticamente all'IA, specifica solo le cartelle a cui l'IA può accedere.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "Le cartelle devono essere percorsi relativi al vault e non possono contenere segmenti '.' o '..'.",
  "settings.aiVaultToolAllowedFolders.placeholder": "Es.: public, shared/docs",
  "settings.externalSkillsRepository": "Repository di origine",
  "settings.externalSkillsRepository.desc": "Gli skill vengono importati dal repository ufficiale {{repo}} e copiati nella cartella skills/ del vault. Ogni skill deve includere un manifest.json.",
  "settings.externalSkills.retry": "Riprova",
  "settings.externalSkills.loading": "Caricamento degli skill disponibili…",
  "settings.externalSkills.loadFailed": "Impossibile caricare gli skill: {{error}}",
  "settings.externalSkills.noSkills": "Nessuno skill compatibile trovato nel repository ufficiale.",
  "settings.externalSkills.allInstalled": "Tutti gli skill disponibili sono già installati.",
  "settings.externalSkills.install": "Installa uno skill",
  "settings.externalSkills.install.desc": "Seleziona uno skill dal repository ufficiale e installalo.",
  "settings.externalSkills.installButton": "Installa",
  "settings.externalSkills.installSkipped": "Impossibile installare {{id}}: {{reason}}",
  "settings.externalSkills.installed": "Skill installati",
  "settings.externalSkills.noVersion": "Nessuna versione",
  "settings.externalSkills.updateAvailable": "Aggiornamento disponibile",
  "settings.externalSkills.check": "Controlla aggiornamenti",
  "settings.externalSkills.upToDate": "Già aggiornato (v{{version}}).",
  "settings.externalSkills.notInCatalog": "Questo skill non è nel repository ufficiale.",
  "settings.externalSkills.updateConfirm": "Aggiornare {{name}} da v{{from}} a v{{to}}?",
  "settings.importSkills": "Importa skill",
  "settings.importSkills.done": "Importati {{skills}} skill, {{files}} file",
  "settings.importSkills.failed": "Impossibile importare gli skill: {{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "Modalità store",
  "settings.storeMode.desc": "Interno: sincronizza file del vault. Esterno: usa uno store esistente.",
  "settings.storeModeInternal": "Interno (sync vault)",
  "settings.storeModeExternal": "Esterno (store esistente)",
  "settings.storeIds": "ID store ricerca semantica",
  "settings.storeIds.desc": "ID store esterni (uno per riga)",
  "settings.storeIds.placeholder": "Es., fileSearchStores/xxx",
  "settings.storeCount": "Numero store",
  "settings.storeCountDesc": "{{count}} store configurato/i",
  "settings.currentStoreId": "ID store corrente",
  "settings.copyStoreId": "Copia ID store",
  "settings.storeIdCopied": "ID store copiato negli appunti",
  "settings.metadataFilter": "Filtro metadati",
  "settings.metadataFilter.desc": "Filtro metadati opzionale applicato al momento della query, con metadati di sincronizzazione interna come path, extension, basename, folder, modified e size",
  "settings.metadataFilter.placeholder": "Filtra per estensione o cartella",
  "settings.metadataFilter.help": "Mostra la sintassi del filtro metadati",
  "settings.metadataFilter.helpTitle": "Sintassi del filtro metadati",
  "settings.metadataFilter.helpIntro": "I filtri metadati limitano i risultati della ricerca file al momento della query. Usa confronti tra stringhe, confronti numerici e and/or per combinare le condizioni.",
  "settings.metadataFilter.helpKeys": "Metadati disponibili",
  "settings.metadataFilter.helpKeyPath": "Percorso del file relativo al vault",
  "settings.metadataFilter.helpKeyExtension": "Estensione del file in minuscolo",
  "settings.metadataFilter.helpKeyBasename": "Nome del file senza estensione",
  "settings.metadataFilter.helpKeyFolder": "Percorso della cartella principale",
  "settings.metadataFilter.helpKeyModified": "Ora di modifica in millisecondi epoch unix",
  "settings.metadataFilter.helpKeySize": "Dimensione del file in byte",
  "settings.metadataFilter.helpExamples": "Esempi",
  "settings.metadataFilter.helpNote": "Il valore modified usa timestamp in millisecondi. Converti le date in millisecondi prima di usarle.",

  // Settings - Sync
  "settings.syncVault": "Sincronizza vault",
  "settings.syncStatus": "{{count}} file indicizzati | Ultima sync: {{lastSync}}",
  "settings.syncing": "Sincronizzazione...",
  "settings.syncUploading": "Caricamento",
  "settings.syncSkipping": "Salto",
  "settings.syncDeleting": "Eliminazione",
  "settings.syncResult": "Sync: {{uploaded}} caricati, {{skipped}} saltati, {{deleted}} eliminati",
  "settings.resetSyncState": "Ripristina stato sync",
  "settings.resetSyncState.desc": "Cancella lo stato di sync locale. La prossima sync ricaricherà tutti i file.",
  "settings.resetSyncStateConfirm": "Sei sicuro di voler ripristinare lo stato di sync?",
  "settings.deleteStore": "Elimina store ricerca semantica",
  "settings.deleteStore.desc": "Elimina lo store corrente e tutti i dati indicizzati dal server",
  "settings.deleteStoreConfirm": "Sei sicuro di voler eliminare lo store? Tutti i dati indicizzati verranno rimossi dal server. Questa azione non può essere annullata.",
  "settings.storeDeleted": "Store ricerca semantica eliminato",
  "settings.deleteStoreFailed": "Errore eliminazione store: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "Visualizza file",
  "settings.ragFiles.title": "File in {{name}}",
  "settings.ragFiles.searchPlaceholder": "Cerca file...",
  "settings.ragFiles.filterAll": "Tutti",
  "settings.ragFiles.filterRegistered": "Registrati",
  "settings.ragFiles.filterPending": "In attesa",
  "settings.ragFiles.noFiles": "Nessun file trovato",
  "settings.ragFiles.registered": "Registrato",
  "settings.ragFiles.pending": "In attesa",
  "settings.ragFiles.fileCount": "{{count}} file",

  // Common buttons
  "common.ok": "OK",
  "common.error": "Errore: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "Il nome non può essere vuoto",
  "modal.name": "Nome",
  "modal.enterName": "Inserisci nome",

  // Chat
  "chat.savedAsNote": "Salvato come {{path}}",
  "chat.chatDeleted": "Chat eliminata",
  "chat.rateLimitPaid": "Questo modello potrebbe aver raggiunto il limite. Prova un altro modello fino a domani.",
  "chat.extendToolLimitTitle": "Estendere il limite di chiamate agli strumenti?",
  "chat.extendToolLimitMessage": "All'assistente restano {{remaining}} chiamate agli strumenti ({{used}}/{{currentLimit}} usate). Aggiungere altre chiamate per questa risposta?",
  "chat.extendToolLimitInput": "Chiamate agli strumenti aggiuntive",
  "chat.extendToolLimitConfirm": "Aggiungi chiamate",
  "chat.errorOccurred": "Spiacente, si è verificato un errore: {{message}}",
  "chat.unknownError": "Errore sconosciuto",
  "chat.helpTitle": "Aiuto Gemini Helper",
  "chat.helpDescription": "Abilita il bundle di conoscenza integrato e chiedi informazioni sulle funzionalità, impostazioni, workflow, ricerca e dashboard di gemini helper, oltre alla risoluzione dei problemi.",
  "chat.askGeminiHelperHelp": "Chiedi informazioni su gemini helper",
  "chat.helpQuestionDraft": "Cosa può fare gemini helper?",
  "chat.yesterday": "Ieri",

  // InputArea
  "okf.builtinHelpDescription": "Riferimento integrato delle funzionalità di gemini helper",
  "input.knowledgeLabel": "Fonti di conoscenza",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.generation.outputPathTaken": "{{path}} contiene già un workflow. Scegli un percorso di output diverso.",
  "workflow.multipleBlocksInFile": "Trovati più blocchi di workflow in un singolo file. Ogni file può contenere un solo workflow; dividi il file manualmente o usa l'azione di migrazione.",
  "workflow.noCodeBlockFound": "Nessun blocco di codice workflow trovato",
  "workflow.migrate": "Dividi in file individuali",
  "workflow.migrateConfirm": "Questo file contiene più blocchi di workflow. Dividere {{count}} di essi in nuovi file fratelli?\n\n{{files}}\n\nIl file originale conserva il primo workflow. Le funzionalità skill, gli hotkey o i trigger di eventi che facevano riferimento al percorso del file originale restano associati al primo workflow — puntali manualmente ai nuovi file se necessario.",
  "workflow.migrateNothingToDo": "Questo file non contiene più blocchi di workflow.",
  "workflow.migrateSuccess": "Migrazione completata: {{count}} workflow divisi in file fratelli.",

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
  "settings.encryption": "Crittografia",
  "settings.encryptChatHistory": "Crittografa cronologia chat IA",
  "settings.encryptChatHistory.desc": "Crittografa i file della cronologia chat IA. Richiede la password per visualizzare il contenuto.",
  "settings.encryptWorkflowHistory": "Crittografa log di esecuzione workflow",
  "settings.encryptWorkflowHistory.desc": "Crittografa i file dei log di esecuzione workflow. Richiede la password per visualizzare il contenuto.",
  "settings.encryptionSetup": "Configura crittografia",
  "settings.encryptionSetup.desc": "Genera le chiavi di crittografia. Puoi crittografare senza password, ma la password è necessaria per decrittografare.",
  "settings.encryptionSetupBtn": "Configura chiavi di crittografia",
  "settings.encryptionPassword": "Password di crittografia",
  "settings.encryptionPassword.desc": "Password per proteggere la chiave privata. Necessaria per la decrittografia.",
  "settings.encryptionPassword.placeholder": "Inserisci password",
  "settings.encryptionConfirmPassword": "Conferma password",
  "settings.encryptionConfirmPassword.placeholder": "Conferma password",
  "settings.encryptionPasswordMismatch": "Le password non corrispondono",
  "settings.encryptionSetupSuccess": "Chiavi di crittografia generate con successo",
  "settings.encryptionSetupFailed": "Impossibile configurare la crittografia: {{error}}",
  "settings.encryptionConfigured": "Crittografia configurata",
  "settings.encryptionConfigured.desc": "Le chiavi di crittografia sono configurate. Scegli quali log crittografare di seguito.",
  "settings.encryptionResetKeys": "Reimposta chiavi di crittografia",
  "settings.encryptionResetKeys.desc": "Genera nuove chiavi di crittografia. Le chat crittografate in precedenza non saranno più leggibili.",
  "settings.encryptionResetKeysConfirm": "Reimpostare le chiavi di crittografia? Tutta la cronologia chat crittografata in precedenza diventerà illeggibile.",
  "settings.encryptionKeysReset": "Le chiavi di crittografia sono state reimpostate",

  // Decryption
  "chat.encryptedChat": "Chat crittografata",
  "chat.decryptFailed": "Decrittografia fallita. Verifica la password.",
  "chat.decrypted": "Decrittografato con successo",

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
  "aiWorkflow.pastePlaceholder": "Incolla il markdown (con blocchi ```workflow) o YAML da Claude, GPT, ecc...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};
