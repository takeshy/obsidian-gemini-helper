// Spanish translations
export const es: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "Skills externos",

  // Settings - API
  "settings.googleApiKey": "Clave API de Google",
  "settings.googleApiKey.desc": "Tu clave API de ai.google.dev. Se guarda en el almacén secreto local de este dispositivo y debe introducirse por separado en cada dispositivo sincronizado.",
  "settings.googleApiKey.missingOnDevice": "Hay una clave API de Google configurada para este vault, pero no está guardada en este dispositivo. Introdúcela en los ajustes de Gemini Helper.",
  "settings.apiPlan": "Plan de API",
  "settings.apiPlan.desc": "Selecciona el tipo de plan para tu clave API (afecta modelos y funciones de búsqueda)",
  "settings.apiPlan.paid": "De pago",
  "settings.apiPlan.free": "Gratuito",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "Carpetas a las que la IA puede acceder automaticamente",
  "settings.aiVaultToolAllowedFolders.desc": "Opcional: si hay directorios que no quieres que la IA lea automaticamente, especifica solo las carpetas a las que la IA puede acceder.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "Las carpetas deben ser rutas relativas al vault y no pueden contener segmentos '.' o '..'.",
  "settings.aiVaultToolAllowedFolders.placeholder": "Ej.: public, shared/docs",
  "settings.externalSkillsRepository": "Repositorio de origen",
  "settings.externalSkillsRepository.desc": "Los skills se importan desde el repositorio oficial {{repo}} y se copian en la carpeta skills/ del vault. Cada skill debe incluir un manifest.json.",
  "settings.externalSkills.retry": "Reintentar",
  "settings.externalSkills.loading": "Cargando skills disponibles…",
  "settings.externalSkills.loadFailed": "No se pudieron cargar los skills: {{error}}",
  "settings.externalSkills.noSkills": "No se encontraron skills compatibles en el repositorio oficial.",
  "settings.externalSkills.allInstalled": "Todos los skills disponibles ya están instalados.",
  "settings.externalSkills.install": "Instalar un skill",
  "settings.externalSkills.install.desc": "Selecciona un skill del repositorio oficial e instálalo.",
  "settings.externalSkills.installButton": "Instalar",
  "settings.externalSkills.installSkipped": "No se pudo instalar {{id}}: {{reason}}",
  "settings.externalSkills.installed": "Skills instalados",
  "settings.externalSkills.noVersion": "Sin versión",
  "settings.externalSkills.updateAvailable": "Actualización disponible",
  "settings.externalSkills.check": "Buscar actualizaciones",
  "settings.externalSkills.upToDate": "Ya está actualizado (v{{version}}).",
  "settings.externalSkills.notInCatalog": "Este skill no está en el repositorio oficial.",
  "settings.externalSkills.updateConfirm": "¿Actualizar {{name}} de v{{from}} a v{{to}}?",
  "settings.importSkills": "Importar skills",
  "settings.importSkills.done": "Se importaron {{skills}} skill(s), {{files}} archivo(s)",
  "settings.importSkills.failed": "No se pudieron importar los skills: {{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "Modo de almacén",
  "settings.storeMode.desc": "Interno: sincroniza archivos del vault. Externo: usa un almacén existente.",
  "settings.storeModeInternal": "Interno (sincronización vault)",
  "settings.storeModeExternal": "Externo (almacén existente)",
  "settings.storeIds": "IDs de almacén de búsqueda semántica",
  "settings.storeIds.desc": "IDs de almacén externo (uno por línea)",
  "settings.storeIds.placeholder": "Ej., fileSearchStores/xxx",
  "settings.storeCount": "Cantidad de almacenes",
  "settings.storeCountDesc": "{{count}} almacén(es) configurado(s)",
  "settings.currentStoreId": "ID de almacén actual",
  "settings.copyStoreId": "Copiar ID de almacén",
  "settings.storeIdCopied": "ID de almacén copiado al portapapeles",
  "settings.metadataFilter": "Filtro de metadatos",
  "settings.metadataFilter.desc": "Filtro de metadatos opcional aplicado en el momento de la consulta, con metadatos de sincronización interna como path, extension, basename, folder, modified y size",
  "settings.metadataFilter.placeholder": "Filtrar por extensión o carpeta",
  "settings.metadataFilter.help": "Mostrar la sintaxis del filtro de metadatos",
  "settings.metadataFilter.helpTitle": "Sintaxis del filtro de metadatos",
  "settings.metadataFilter.helpIntro": "Los filtros de metadatos limitan los resultados de la búsqueda de archivos en el momento de la consulta. Usa comparaciones de cadenas, comparaciones numéricas y and/or para combinar condiciones.",
  "settings.metadataFilter.helpKeys": "Metadatos disponibles",
  "settings.metadataFilter.helpKeyPath": "Ruta del archivo relativa al vault",
  "settings.metadataFilter.helpKeyExtension": "Extensión del archivo en minúsculas",
  "settings.metadataFilter.helpKeyBasename": "Nombre del archivo sin extensión",
  "settings.metadataFilter.helpKeyFolder": "Ruta de la carpeta principal",
  "settings.metadataFilter.helpKeyModified": "Hora de modificación como milisegundos de época unix",
  "settings.metadataFilter.helpKeySize": "Tamaño del archivo en bytes",
  "settings.metadataFilter.helpExamples": "Ejemplos",
  "settings.metadataFilter.helpNote": "El valor modified usa marcas de tiempo en milisegundos. Convierte las fechas a milisegundos antes de usarlas.",

  // Settings - Sync
  "settings.syncVault": "Sincronizar vault",
  "settings.syncStatus": "{{count}} archivos indexados | Última sincronización: {{lastSync}}",
  "settings.syncing": "Sincronizando...",
  "settings.syncUploading": "Subiendo",
  "settings.syncSkipping": "Omitiendo",
  "settings.syncDeleting": "Eliminando",
  "settings.syncResult": "Sincronización: {{uploaded}} subidos, {{skipped}} omitidos, {{deleted}} eliminados",
  "settings.resetSyncState": "Restablecer estado de sincronización",
  "settings.resetSyncState.desc": "Limpiar el estado de sincronización local. La próxima sincronización volverá a subir todos los archivos.",
  "settings.resetSyncStateConfirm": "¿Estás seguro de restablecer el estado de sincronización?",
  "settings.deleteStore": "Eliminar almacén de búsqueda semántica",
  "settings.deleteStore.desc": "Eliminar el almacén actual y todos los datos indexados del servidor",
  "settings.deleteStoreConfirm": "¿Estás seguro de eliminar el almacén? Se eliminarán todos los datos indexados del servidor. Esta acción no se puede deshacer.",
  "settings.storeDeleted": "Almacén de búsqueda semántica eliminado",
  "settings.deleteStoreFailed": "Error al eliminar almacén: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "Ver archivos",
  "settings.ragFiles.title": "Archivos en {{name}}",
  "settings.ragFiles.searchPlaceholder": "Buscar archivos...",
  "settings.ragFiles.filterAll": "Todos",
  "settings.ragFiles.filterRegistered": "Registrados",
  "settings.ragFiles.filterPending": "Pendientes",
  "settings.ragFiles.noFiles": "No se encontraron archivos",
  "settings.ragFiles.registered": "Registrado",
  "settings.ragFiles.pending": "Pendiente",
  "settings.ragFiles.fileCount": "{{count}} archivos",

  // Common buttons
  "common.ok": "OK",
  "common.error": "Error: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "El nombre no puede estar vacío",
  "modal.name": "Nombre",
  "modal.enterName": "Introduce el nombre",

  // Chat
  "chat.savedAsNote": "Guardado como {{path}}",
  "chat.chatDeleted": "Chat eliminado",
  "chat.rateLimitPaid": "Este modelo puede tener límite de tasa. Prueba otro modelo hasta mañana.",
  "chat.extendToolLimitTitle": "¿Ampliar el límite de llamadas a herramientas?",
  "chat.extendToolLimitMessage": "Al asistente le quedan {{remaining}} llamadas a herramientas ({{used}}/{{currentLimit}} usadas). ¿Añadir más llamadas para esta respuesta?",
  "chat.extendToolLimitInput": "Llamadas a herramientas adicionales",
  "chat.extendToolLimitConfirm": "Añadir llamadas",
  "chat.errorOccurred": "Lo siento, ocurrió un error: {{message}}",
  "chat.unknownError": "Error desconocido",
  "chat.helpTitle": "Ayuda de Gemini Helper",
  "chat.helpDescription": "Activa el paquete de conocimiento de ayuda integrado y pregunta sobre las funciones, ajustes, workflows, búsqueda, paneles y resolución de problemas de Gemini Helper.",
  "chat.askGeminiHelperHelp": "Preguntar sobre Gemini Helper",
  "chat.helpQuestionDraft": "¿Qué puede hacer Gemini Helper?",
  "chat.yesterday": "Ayer",

  // InputArea
  "okf.builtinHelpDescription": "Referencia integrada de funciones de Gemini Helper",
  "input.knowledgeLabel": "Fuentes de conocimiento",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.generation.outputPathTaken": "{{path}} ya contiene un workflow. Elige una ruta de salida diferente.",
  "workflow.multipleBlocksInFile": "Se encontraron varios bloques de workflow en un solo archivo. Cada archivo solo puede contener un workflow; divide el archivo manualmente o usa la acción de migración.",
  "workflow.noCodeBlockFound": "No se encontró ningún bloque de código de workflow",
  "workflow.migrateConfirm": "Este archivo contiene varios bloques de workflow. ¿Dividir {{count}} de ellos en nuevos archivos hermanos?\n\n{{files}}\n\nEl archivo original conserva el primer workflow. Las capacidades de skill, atajos de teclado o disparadores de eventos que hacían referencia a la ruta del archivo original permanecen vinculados al primer workflow; apúntalos a los nuevos archivos manualmente si es necesario.",
  "workflow.migrateNothingToDo": "Este archivo no contiene varios bloques de workflow.",
  "workflow.migrateSuccess": "Migración completada: {{count}} workflow(s) divididos en archivos hermanos.",

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
  "settings.encryption": "Cifrado",
  "settings.encryptChatHistory": "Cifrar historial de chat de IA",
  "settings.encryptChatHistory.desc": "Cifrar archivos de historial de chat de IA. Requiere contraseña para ver el contenido.",
  "settings.encryptWorkflowHistory": "Cifrar registros de ejecución de workflows",
  "settings.encryptWorkflowHistory.desc": "Cifrar archivos de registros de ejecución de workflows. Requiere contraseña para ver el contenido.",
  "settings.encryptionSetup": "Configurar cifrado",
  "settings.encryptionSetup.desc": "Generar claves de cifrado. Puedes cifrar sin contraseña, pero necesitas la contraseña para descifrar.",
  "settings.encryptionSetupBtn": "Configurar claves de cifrado",
  "settings.encryptionPassword": "Contraseña de cifrado",
  "settings.encryptionPassword.desc": "Contraseña para proteger la clave privada. Requerida para descifrar.",
  "settings.encryptionPassword.placeholder": "Introduce la contraseña",
  "settings.encryptionConfirmPassword": "Confirmar contraseña",
  "settings.encryptionConfirmPassword.placeholder": "Confirmar contraseña",
  "settings.encryptionPasswordMismatch": "Las contraseñas no coinciden",
  "settings.encryptionSetupSuccess": "Claves de cifrado generadas exitosamente",
  "settings.encryptionSetupFailed": "Error al configurar cifrado: {{error}}",
  "settings.encryptionConfigured": "Cifrado configurado",
  "settings.encryptionConfigured.desc": "Las claves de cifrado están configuradas. Elige qué registros cifrar a continuación.",
  "settings.encryptionResetKeys": "Restablecer claves de cifrado",
  "settings.encryptionResetKeys.desc": "Generar nuevas claves de cifrado. Los chats cifrados anteriormente no serán legibles.",
  "settings.encryptionResetKeysConfirm": "¿Restablecer claves de cifrado? Todo el historial de chat cifrado anteriormente será ilegible.",
  "settings.encryptionKeysReset": "Las claves de cifrado han sido restablecidas",

  // Decryption
  "chat.encryptedChat": "Chat cifrado",
  "chat.decryptFailed": "Descifrado fallido. Verifica tu contraseña.",
  "chat.decrypted": "Descifrado exitosamente",

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
  "aiWorkflow.pastePlaceholder": "Pegar el markdown (con bloques ```workflow) o YAML de Claude, GPT, etc...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};
