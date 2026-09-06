// German translations
export const de: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "Externe Skills",

  // Settings - API
  "settings.googleApiKey": "Google API-Schlüssel",
  "settings.googleApiKey.desc": "Ihr API-Schlüssel von ai.google.dev. Er wird im lokalen Geheimnisspeicher dieses Geräts gespeichert und muss auf jedem synchronisierten Gerät separat eingegeben werden.",
  "settings.googleApiKey.missingOnDevice": "Für diesen Vault ist ein Google-API-Schlüssel konfiguriert, aber auf diesem Gerät nicht gespeichert. Geben Sie ihn in den Gemini-Helper-Einstellungen ein.",
  "settings.apiPlan": "API-Plan",
  "settings.apiPlan.desc": "Wählen Sie den Plantyp für Ihren API-Schlüssel (beeinflusst verfügbare Modelle und Suchfunktionen)",
  "settings.apiPlan.paid": "Bezahlt",
  "settings.apiPlan.free": "Kostenlos",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "Ordner, auf die KI automatisch zugreifen kann",
  "settings.aiVaultToolAllowedFolders.desc": "Optional: Wenn es Verzeichnisse gibt, die die KI nicht automatisch lesen soll, geben Sie nur die Ordner an, auf die die KI zugreifen darf.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "Ordner müssen vault-relative Pfade sein und dürfen keine Segmente . oder .. enthalten.",
  "settings.aiVaultToolAllowedFolders.placeholder": "Z. B.: public, shared/docs",
  "settings.externalSkillsRepository": "Quell-Repository",
  "settings.externalSkillsRepository.desc": "Skills werden aus dem offiziellen Repository {{repo}} importiert und in den vault-Ordner skills/ kopiert. Jeder Skill muss eine manifest.json enthalten.",
  "settings.externalSkills.retry": "Erneut versuchen",
  "settings.externalSkills.loading": "Verfügbare Skills werden geladen…",
  "settings.externalSkills.loadFailed": "Skills konnten nicht geladen werden: {{error}}",
  "settings.externalSkills.noSkills": "Keine kompatiblen Skills im offiziellen Repository gefunden.",
  "settings.externalSkills.allInstalled": "Alle verfügbaren Skills sind bereits installiert.",
  "settings.externalSkills.install": "Skill installieren",
  "settings.externalSkills.install.desc": "Wählen Sie einen Skill aus dem offiziellen Repository und installieren Sie ihn.",
  "settings.externalSkills.installButton": "Installieren",
  "settings.externalSkills.installSkipped": "{{id}} konnte nicht installiert werden: {{reason}}",
  "settings.externalSkills.installed": "Installierte Skills",
  "settings.externalSkills.noVersion": "Keine Version",
  "settings.externalSkills.updateAvailable": "Update verfügbar",
  "settings.externalSkills.check": "Nach Updates suchen",
  "settings.externalSkills.upToDate": "Bereits aktuell (v{{version}}).",
  "settings.externalSkills.notInCatalog": "Dieser Skill ist nicht im offiziellen Repository enthalten.",
  "settings.externalSkills.updateConfirm": "{{name}} von v{{from}} auf v{{to}} aktualisieren?",
  "settings.importSkills": "Skills importieren",
  "settings.importSkills.done": "{{skills}} Skill(s), {{files}} Datei(en) importiert",
  "settings.importSkills.failed": "Skills konnten nicht importiert werden: {{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "Store-Modus",
  "settings.storeMode.desc": "Intern: Vault-Dateien synchronisieren. Extern: Existierenden Store verwenden.",
  "settings.storeModeInternal": "Intern (Vault-Sync)",
  "settings.storeModeExternal": "Extern (existierender Store)",
  "settings.storeIds": "Semantische Such-Store-IDs",
  "settings.storeIds.desc": "Externe Store-IDs (eine pro Zeile)",
  "settings.storeIds.placeholder": "Z.B., fileSearchStores/xxx",
  "settings.storeCount": "Store-Anzahl",
  "settings.storeCountDesc": "{{count}} Store(s) konfiguriert",
  "settings.currentStoreId": "Aktuelle Store-ID",
  "settings.copyStoreId": "Store-ID kopieren",
  "settings.storeIdCopied": "Store-ID in Zwischenablage kopiert",
  "settings.metadataFilter": "Metadatenfilter",
  "settings.metadataFilter.desc": "Optionaler Metadatenfilter, der zur Abfragezeit angewendet wird, mit internen Sync-Metadaten wie path, extension, basename, folder, modified und size",
  "settings.metadataFilter.placeholder": "Nach Erweiterung oder Ordner filtern",
  "settings.metadataFilter.help": "Syntax des Metadatenfilters anzeigen",
  "settings.metadataFilter.helpTitle": "Syntax des Metadatenfilters",
  "settings.metadataFilter.helpIntro": "Metadatenfilter beschränken die Dateisuchergebnisse zur Abfragezeit. Verwenden Sie Zeichenkettenvergleiche, numerische Vergleiche sowie and/or, um Bedingungen zu kombinieren.",
  "settings.metadataFilter.helpKeys": "Verfügbare Metadaten",
  "settings.metadataFilter.helpKeyPath": "Vault-relativer Dateipfad",
  "settings.metadataFilter.helpKeyExtension": "Dateierweiterung in Kleinbuchstaben",
  "settings.metadataFilter.helpKeyBasename": "Dateiname ohne Erweiterung",
  "settings.metadataFilter.helpKeyFolder": "Pfad des übergeordneten Ordners",
  "settings.metadataFilter.helpKeyModified": "Änderungszeit als Unix-Epoch-Millisekunden",
  "settings.metadataFilter.helpKeySize": "Dateigröße in Bytes",
  "settings.metadataFilter.helpExamples": "Beispiele",
  "settings.metadataFilter.helpNote": "Der Wert modified verwendet Millisekunden-Zeitstempel. Konvertieren Sie Datumsangaben vor der Verwendung in Millisekunden.",

  // Settings - Sync
  "settings.syncVault": "Vault synchronisieren",
  "settings.syncStatus": "{{count}} Dateien indiziert | Letzte Sync: {{lastSync}}",
  "settings.syncing": "Synchronisierung...",
  "settings.syncUploading": "Hochladen",
  "settings.syncSkipping": "Überspringen",
  "settings.syncDeleting": "Löschen",
  "settings.syncResult": "Sync: {{uploaded}} hochgeladen, {{skipped}} übersprungen, {{deleted}} gelöscht",
  "settings.resetSyncState": "Sync-Status zurücksetzen",
  "settings.resetSyncState.desc": "Lokalen Sync-Status löschen. Nächste Sync lädt alle Dateien erneut hoch.",
  "settings.resetSyncStateConfirm": "Sind Sie sicher, dass Sie den Sync-Status zurücksetzen möchten?",
  "settings.deleteStore": "Semantischen Such-Store löschen",
  "settings.deleteStore.desc": "Aktuellen Store und alle indizierten Daten vom Server löschen",
  "settings.deleteStoreConfirm": "Sind Sie sicher, dass Sie den Store löschen möchten? Alle indizierten Daten werden vom Server entfernt. Dies kann nicht rückgängig gemacht werden.",
  "settings.storeDeleted": "Semantischer Such-Store gelöscht",
  "settings.deleteStoreFailed": "Store-Löschung fehlgeschlagen: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "Dateien anzeigen",
  "settings.ragFiles.title": "Dateien in {{name}}",
  "settings.ragFiles.searchPlaceholder": "Dateien suchen...",
  "settings.ragFiles.filterAll": "Alle",
  "settings.ragFiles.filterRegistered": "Registriert",
  "settings.ragFiles.filterPending": "Ausstehend",
  "settings.ragFiles.noFiles": "Keine Dateien gefunden",
  "settings.ragFiles.registered": "Registriert",
  "settings.ragFiles.pending": "Ausstehend",
  "settings.ragFiles.fileCount": "{{count}} Dateien",

  // Common buttons
  "common.ok": "OK",
  "common.error": "Fehler: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "Name darf nicht leer sein",
  "modal.name": "Name",
  "modal.enterName": "Name eingeben",

  // Chat
  "chat.savedAsNote": "Gespeichert als {{path}}",
  "chat.chatDeleted": "Chat gelöscht",
  "chat.rateLimitPaid": "Dieses Modell könnte ratenbegrenzt sein. Versuchen Sie bis morgen ein anderes Modell.",
  "chat.extendToolLimitTitle": "Limit für Tool-Aufrufe erweitern?",
  "chat.extendToolLimitMessage": "Der Assistent hat noch {{remaining}} Tool-Aufrufe übrig ({{used}}/{{currentLimit}} verwendet). Weitere Aufrufe für diese Antwort hinzufügen?",
  "chat.extendToolLimitInput": "Zusätzliche Tool-Aufrufe",
  "chat.extendToolLimitConfirm": "Aufrufe hinzufügen",
  "chat.errorOccurred": "Entschuldigung, ein Fehler ist aufgetreten: {{message}}",
  "chat.unknownError": "Unbekannter Fehler",
  "chat.helpTitle": "Gemini-Helper-Hilfe",
  "chat.helpDescription": "Aktivieren Sie das integrierte Hilfe-Wissensbündel und fragen Sie nach Gemini-Helper-Funktionen, Einstellungen, Workflows, Suche, Dashboards und Fehlerbehebung.",
  "chat.askGeminiHelperHelp": "Nach Gemini Helper fragen",
  "chat.helpQuestionDraft": "Was kann Gemini Helper?",
  "chat.yesterday": "Gestern",

  // InputArea
  "okf.builtinHelpDescription": "Integrierte Gemini-Helper-Funktionsreferenz",
  "input.knowledgeLabel": "Wissensquellen",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.multipleBlocksInFile": "Mehrere Workflow-Blöcke in einer einzigen Datei gefunden. Jede Datei darf nur einen Workflow enthalten; teilen Sie die Datei manuell auf oder verwenden Sie die Migrationsaktion.",
  "workflow.migrateConfirm": "Diese Datei enthält mehrere Workflow-Blöcke. {{count}} davon in neue gleichrangige Dateien aufteilen?\n\n{{files}}\n\nDie ursprüngliche Datei behält den ersten Workflow. Skill-Funktionen, Hotkeys oder Ereignis-Trigger, die auf den ursprünglichen Dateipfad verwiesen, bleiben mit dem ersten Workflow verknüpft – richten Sie sie bei Bedarf manuell auf die neuen Dateien aus.",
  "workflow.migrateSuccess": "Migration abgeschlossen: {{count}} Workflow(s) in gleichrangige Dateien aufgeteilt.",

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
  "settings.encryption": "Verschlüsselung",
  "settings.encryptChatHistory": "KI-Chat-Verlauf verschlüsseln",
  "settings.encryptChatHistory.desc": "KI-Chat-Verlaufsdateien verschlüsseln. Passwort zum Anzeigen erforderlich.",
  "settings.encryptWorkflowHistory": "Workflow-Ausführungsprotokolle verschlüsseln",
  "settings.encryptWorkflowHistory.desc": "Workflow-Ausführungsprotokolldateien verschlüsseln. Passwort zum Anzeigen erforderlich.",
  "settings.encryptionSetup": "Verschlüsselung einrichten",
  "settings.encryptionSetup.desc": "Verschlüsselungsschlüssel generieren. Verschlüsselung ohne Passwort möglich, aber Passwort zum Entschlüsseln nötig.",
  "settings.encryptionSetupBtn": "Verschlüsselungsschlüssel erstellen",
  "settings.encryptionPassword": "Verschlüsselungspasswort",
  "settings.encryptionPassword.desc": "Passwort zum Schutz des privaten Schlüssels. Für die Entschlüsselung erforderlich.",
  "settings.encryptionPassword.placeholder": "Passwort eingeben",
  "settings.encryptionConfirmPassword": "Passwort bestätigen",
  "settings.encryptionConfirmPassword.placeholder": "Passwort bestätigen",
  "settings.encryptionPasswordMismatch": "Passwörter stimmen nicht überein",
  "settings.encryptionSetupSuccess": "Verschlüsselungsschlüssel erfolgreich erstellt",
  "settings.encryptionSetupFailed": "Verschlüsselung einrichten fehlgeschlagen: {{error}}",
  "settings.encryptionConfigured": "Verschlüsselung konfiguriert",
  "settings.encryptionConfigured.desc": "Verschlüsselungsschlüssel sind eingerichtet. Wählen Sie unten, welche Protokolle verschlüsselt werden sollen.",
  "settings.encryptionResetKeys": "Verschlüsselungsschlüssel zurücksetzen",
  "settings.encryptionResetKeys.desc": "Neue Verschlüsselungsschlüssel generieren. Zuvor verschlüsselte Chats werden nicht mehr lesbar sein.",
  "settings.encryptionResetKeysConfirm": "Verschlüsselungsschlüssel zurücksetzen? Alle zuvor verschlüsselten Chat-Verläufe werden unlesbar.",
  "settings.encryptionKeysReset": "Verschlüsselungsschlüssel wurden zurückgesetzt",

  // Decryption
  "chat.encryptedChat": "Verschlüsselter Chat",
  "chat.decryptFailed": "Entschlüsselung fehlgeschlagen. Überprüfen Sie Ihr Passwort.",
  "chat.decrypted": "Erfolgreich entschlüsselt",

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
  "aiWorkflow.pastePlaceholder": "Markdown (mit ```workflow-Blöcken) oder YAML von Claude, GPT usw. einfügen...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};
