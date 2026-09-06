// Portuguese translations
export const pt: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "Skills externos",

  // Settings - API
  "settings.googleApiKey": "Chave API do Google",
  "settings.googleApiKey.desc": "Sua chave API de ai.google.dev. Ela é salva no armazenamento secreto local deste dispositivo e deve ser inserida separadamente em cada dispositivo sincronizado.",
  "settings.googleApiKey.missingOnDevice": "Uma chave API do Google está configurada para este vault, mas não está salva neste dispositivo. Insira-a nas configurações do Gemini Helper.",
  "settings.apiPlan": "Plano API",
  "settings.apiPlan.desc": "Selecione o tipo de plano para sua chave API (afeta modelos e recursos de pesquisa)",
  "settings.apiPlan.paid": "Pago",
  "settings.apiPlan.free": "Gratuito",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "Pastas que a IA pode acessar automaticamente",
  "settings.aiVaultToolAllowedFolders.desc": "Opcional: se houver diretorios que voce nao quer que a IA leia automaticamente, especifique apenas as pastas que a IA pode acessar.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "As pastas devem ser caminhos relativos ao vault e nao podem conter segmentos '.' ou '..'.",
  "settings.aiVaultToolAllowedFolders.placeholder": "Ex.: public, shared/docs",
  "settings.externalSkillsRepository": "Repositório de origem",
  "settings.externalSkillsRepository.desc": "Os skills são importados do repositório oficial {{repo}} e copiados para a pasta skills/ do vault. Cada skill deve incluir um manifest.json.",
  "settings.externalSkills.retry": "Tentar novamente",
  "settings.externalSkills.loading": "Carregando skills disponíveis…",
  "settings.externalSkills.loadFailed": "Falha ao carregar skills: {{error}}",
  "settings.externalSkills.noSkills": "Nenhum skill compatível encontrado no repositório oficial.",
  "settings.externalSkills.allInstalled": "Todos os skills disponíveis já estão instalados.",
  "settings.externalSkills.install": "Instalar um skill",
  "settings.externalSkills.install.desc": "Selecione um skill do repositório oficial e instale-o.",
  "settings.externalSkills.installButton": "Instalar",
  "settings.externalSkills.installSkipped": "Não foi possível instalar {{id}}: {{reason}}",
  "settings.externalSkills.installed": "Skills instalados",
  "settings.externalSkills.noVersion": "Sem versão",
  "settings.externalSkills.updateAvailable": "Atualização disponível",
  "settings.externalSkills.check": "Verificar atualizações",
  "settings.externalSkills.upToDate": "Já está atualizado (v{{version}}).",
  "settings.externalSkills.notInCatalog": "Este skill não está no repositório oficial.",
  "settings.externalSkills.updateConfirm": "Atualizar {{name}} de v{{from}} para v{{to}}?",
  "settings.importSkills": "Importar skills",
  "settings.importSkills.done": "Importados {{skills}} skill(s), {{files}} arquivo(s)",
  "settings.importSkills.failed": "Falha ao importar skills: {{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "Modo de armazenamento",
  "settings.storeMode.desc": "Interno: sincroniza arquivos do vault. Externo: usa um store existente.",
  "settings.storeModeInternal": "Interno (sincronizacao vault)",
  "settings.storeModeExternal": "Externo (store existente)",
  "settings.storeIds": "IDs de store de pesquisa semantica",
  "settings.storeIds.desc": "IDs de store externo (um por linha)",
  "settings.storeIds.placeholder": "Ex., fileSearchStores/xxx",
  "settings.storeCount": "Quantidade de stores",
  "settings.storeCountDesc": "{{count}} store(s) configurado(s)",
  "settings.currentStoreId": "ID do store atual",
  "settings.copyStoreId": "Copiar ID do store",
  "settings.storeIdCopied": "ID do store copiado para a area de transferencia",
  "settings.metadataFilter": "Filtro de metadados",
  "settings.metadataFilter.desc": "Filtro de metadados opcional aplicado no momento da consulta, com metadados de sincronização interna como path, extension, basename, folder, modified e size",
  "settings.metadataFilter.placeholder": "Filtrar por extensão ou pasta",
  "settings.metadataFilter.help": "Mostrar a sintaxe do filtro de metadados",
  "settings.metadataFilter.helpTitle": "Sintaxe do filtro de metadados",
  "settings.metadataFilter.helpIntro": "Os filtros de metadados limitam os resultados da busca de arquivos no momento da consulta. Use comparações de strings, comparações numéricas e and/or para combinar condições.",
  "settings.metadataFilter.helpKeys": "Metadados disponíveis",
  "settings.metadataFilter.helpKeyPath": "Caminho do arquivo relativo ao vault",
  "settings.metadataFilter.helpKeyExtension": "Extensão do arquivo em minúsculas",
  "settings.metadataFilter.helpKeyBasename": "Nome do arquivo sem extensão",
  "settings.metadataFilter.helpKeyFolder": "Caminho da pasta principal",
  "settings.metadataFilter.helpKeyModified": "Hora de modificação em milissegundos de época unix",
  "settings.metadataFilter.helpKeySize": "Tamanho do arquivo em bytes",
  "settings.metadataFilter.helpExamples": "Exemplos",
  "settings.metadataFilter.helpNote": "O valor modified usa carimbos de data/hora em milissegundos. Converta as datas em milissegundos antes de usá-las.",

  // Settings - Sync
  "settings.syncVault": "Sincronizar vault",
  "settings.syncStatus": "{{count}} arquivos indexados | Ultima sincronizacao: {{lastSync}}",
  "settings.syncing": "Sincronizando...",
  "settings.syncUploading": "Enviando",
  "settings.syncSkipping": "Pulando",
  "settings.syncDeleting": "Excluindo",
  "settings.syncResult": "Sincronizacao: {{uploaded}} enviados, {{skipped}} pulados, {{deleted}} excluidos",
  "settings.resetSyncState": "Redefinir estado de sincronizacao",
  "settings.resetSyncState.desc": "Limpar o estado de sincronizacao local. A proxima sincronizacao reenviara todos os arquivos.",
  "settings.resetSyncStateConfirm": "Tem certeza que deseja redefinir o estado de sincronizacao?",
  "settings.deleteStore": "Excluir store de pesquisa semantica",
  "settings.deleteStore.desc": "Excluir o store atual e todos os dados indexados do servidor",
  "settings.deleteStoreConfirm": "Tem certeza que deseja excluir o store? Todos os dados indexados serao removidos do servidor. Esta acao nao pode ser desfeita.",
  "settings.storeDeleted": "Store de pesquisa semantica excluido",
  "settings.deleteStoreFailed": "Falha ao excluir store: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "Ver arquivos",
  "settings.ragFiles.title": "Arquivos em {{name}}",
  "settings.ragFiles.searchPlaceholder": "Pesquisar arquivos...",
  "settings.ragFiles.filterAll": "Todos",
  "settings.ragFiles.filterRegistered": "Registrados",
  "settings.ragFiles.filterPending": "Pendentes",
  "settings.ragFiles.noFiles": "Nenhum arquivo encontrado",
  "settings.ragFiles.registered": "Registrado",
  "settings.ragFiles.pending": "Pendente",
  "settings.ragFiles.fileCount": "{{count}} arquivos",

  // Common buttons
  "common.ok": "OK",
  "common.error": "Erro: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "O nome nao pode estar vazio",
  "modal.name": "Nome",
  "modal.enterName": "Digite o nome",

  // Chat
  "chat.savedAsNote": "Salvo como {{path}}",
  "chat.chatDeleted": "Chat excluido",
  "chat.rateLimitPaid": "Este modelo pode estar com limite de taxa. Tente outro modelo ate amanha.",
  "chat.extendToolLimitTitle": "Estender o limite de chamadas de ferramentas?",
  "chat.extendToolLimitMessage": "O assistente tem {{remaining}} chamadas de ferramentas restantes ({{used}}/{{currentLimit}} usadas). Adicionar mais chamadas para esta resposta?",
  "chat.extendToolLimitInput": "Chamadas de ferramentas adicionais",
  "chat.extendToolLimitConfirm": "Adicionar chamadas",
  "chat.errorOccurred": "Desculpe, ocorreu um erro: {{message}}",
  "chat.unknownError": "Erro desconhecido",
  "chat.helpTitle": "Ajuda do Gemini Helper",
  "chat.helpDescription": "Ative o pacote de conhecimento de ajuda integrado e pergunte sobre os recursos, configurações, workflows, busca, painéis e solução de problemas do Gemini Helper.",
  "chat.askGeminiHelperHelp": "Perguntar sobre o gemini helper",
  "chat.helpQuestionDraft": "O que o gemini helper pode fazer?",
  "chat.yesterday": "Ontem",

  // InputArea
  "okf.builtinHelpDescription": "Referência integrada dos recursos do gemini helper",
  "input.knowledgeLabel": "Fontes de conhecimento",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.generation.outputPathTaken": "{{path}} já contém um workflow. Escolha um caminho de saída diferente.",
  "workflow.multipleBlocksInFile": "Vários blocos de workflow encontrados em um único arquivo. Cada arquivo pode conter apenas um workflow; divida o arquivo manualmente ou use a ação de migração.",
  "workflow.noCodeBlockFound": "Nenhum bloco de código de workflow encontrado",
  "workflow.migrateConfirm": "Este arquivo contém vários blocos de workflow. Dividir {{count}} deles em novos arquivos irmãos?\n\n{{files}}\n\nO arquivo original mantém o primeiro workflow. Recursos de skill, atalhos de teclado ou gatilhos de evento que referenciavam o caminho do arquivo original permanecem vinculados ao primeiro workflow — aponte-os para os novos arquivos manualmente, se necessário.",
  "workflow.migrateNothingToDo": "Este arquivo não contém vários blocos de workflow.",
  "workflow.migrateSuccess": "Migração concluída: {{count}} workflow(s) divididos em arquivos irmãos.",

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
  "settings.encryption": "Criptografia",
  "settings.encryptChatHistory": "Criptografar historico de chat com IA",
  "settings.encryptChatHistory.desc": "Criptografar arquivos de historico de chat com IA. Requer senha para visualizar o conteudo.",
  "settings.encryptWorkflowHistory": "Criptografar logs de execucao de workflows",
  "settings.encryptWorkflowHistory.desc": "Criptografar arquivos de logs de execucao de workflows. Requer senha para visualizar o conteudo.",
  "settings.encryptionSetup": "Configurar criptografia",
  "settings.encryptionSetup.desc": "Gerar chaves de criptografia. Voce pode criptografar sem senha, mas precisa de senha para descriptografar.",
  "settings.encryptionSetupBtn": "Configurar chaves de criptografia",
  "settings.encryptionPassword": "Senha de criptografia",
  "settings.encryptionPassword.desc": "Senha para proteger a chave privada. Necessaria para descriptografia.",
  "settings.encryptionPassword.placeholder": "Digite a senha",
  "settings.encryptionConfirmPassword": "Confirmar senha",
  "settings.encryptionConfirmPassword.placeholder": "Confirmar senha",
  "settings.encryptionPasswordMismatch": "As senhas nao coincidem",
  "settings.encryptionSetupSuccess": "Chaves de criptografia geradas com sucesso",
  "settings.encryptionSetupFailed": "Falha ao configurar criptografia: {{error}}",
  "settings.encryptionConfigured": "Criptografia configurada",
  "settings.encryptionConfigured.desc": "As chaves de criptografia estao configuradas. Escolha quais logs criptografar abaixo.",
  "settings.encryptionResetKeys": "Redefinir chaves de criptografia",
  "settings.encryptionResetKeys.desc": "Gerar novas chaves de criptografia. Chats criptografados anteriores nao serao legiveis.",
  "settings.encryptionResetKeysConfirm": "Redefinir chaves de criptografia? Todo historico de chat criptografado anteriormente ficara ilegivel.",
  "settings.encryptionKeysReset": "As chaves de criptografia foram redefinidas",

  // Decryption
  "chat.encryptedChat": "Chat criptografado",
  "chat.decryptFailed": "Falha na descriptografia. Verifique sua senha.",
  "chat.decrypted": "Descriptografado com sucesso",

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
  "aiWorkflow.pastePlaceholder": "Cole o markdown (com blocos ```workflow) ou YAML do Claude, GPT, etc...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // LLM vault tool folders
  // Dashboard
};
