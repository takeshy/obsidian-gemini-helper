# Gemini Helper para Obsidian

Assistente de IA **gratuito e open-source** para Obsidian com **Chat**, **Automação de Workflows** e **RAG** alimentado pelo Google Gemini.

> **Este plugin é completamente gratuito.** Você só precisa de uma chave de API do Google Gemini (gratuita ou paga) de [ai.google.dev](https://ai.google.dev), ou usar ferramentas CLI: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code) ou [Codex CLI](https://github.com/openai/codex).

## Destaques

- **Chat com IA** - Respostas em streaming, anexos de arquivos, operações no vault, comandos de barra
- **Construtor de Workflows** - Automatize tarefas de múltiplas etapas com editor visual de nós e 22 tipos de nós
- **Histórico de Edições** - Rastreie e restaure alterações feitas pela IA com visualização de diff
- **RAG** - Geração Aumentada por Recuperação para busca inteligente em seu vault
- **Busca na Web** - Acesse informações atualizadas via Google Search
- **Geração de Imagens** - Crie imagens com modelos de imagem do Gemini

## Chave de API / Opções de CLI

Este plugin requer uma chave de API do Google Gemini ou uma ferramenta CLI. Você pode escolher entre:

| Recurso | Chave API Gratuita | Chave API Paga | CLI |
|---------|---------------------|-----------------|-----|
| Chat básico | ✅ | ✅ | ✅ |
| Operações no vault | ✅ | ✅ | Somente Leitura/Busca |
| Busca na Web | ✅ | ✅ | ❌ |
| RAG | ✅ (limitado) | ✅ | ❌ |
| Workflow | ✅ | ✅ | ✅ |
| Geração de Imagens | ❌ | ✅ | ❌ |
| Modelos | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| Custo | **Gratuito** | Pague por uso | **Gratuito** |

> [!TIP]
> **Opções de CLI** permitem usar modelos principais apenas com uma conta - sem necessidade de chave de API!
> - **Gemini CLI**: Instale o [Gemini CLI](https://github.com/google-gemini/gemini-cli), execute `gemini` e autentique com `/auth`
> - **Claude CLI**: Instale o [Claude Code](https://github.com/anthropics/claude-code) (`npm install -g @anthropic-ai/claude-code`), execute `claude` e autentique
> - **Codex CLI**: Instale o [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`), execute `codex` e autentique

### Dicas para Chave de API Gratuita

- **Limites de taxa** são por modelo e reiniciam diariamente. Troque de modelo para continuar trabalhando.
- **Sincronização RAG** é limitada. Execute "Sync Vault" diariamente - arquivos já enviados são ignorados.
- **Modelos Gemma** e **Gemini CLI** não suportam operações no vault no Chat, mas **Workflows ainda podem ler/escrever notas** usando os tipos de nó `note`, `note-read` e outros. As variáveis `{content}` e `{selection}` também funcionam.

---

# Chat com IA

O recurso de Chat com IA fornece uma interface de conversação interativa com o Google Gemini, integrada ao seu vault do Obsidian.

![Interface do Chat](chat.png)

## Comandos de Barra

Crie templates de prompts reutilizáveis acionados por `/`:

- Defina templates com `{selection}` (texto selecionado) e `{content}` (nota ativa)
- Modelo opcional e substituição de busca por comando
- Digite `/` para ver os comandos disponíveis

**Padrão:** `/infographic` - Converte conteúdo em infográfico HTML

![Exemplo de Infográfico](chat_infographic.png)

## Menções com @

Referencie arquivos e variáveis digitando `@`:

- `{selection}` - Texto selecionado
- `{content}` - Conteúdo da nota ativa
- Qualquer arquivo do vault - Navegue e insira (somente caminho; a IA lê o conteúdo via ferramentas)

> [!NOTE]
> Menções de arquivos do vault com @ inserem apenas o caminho do arquivo - a IA lê o conteúdo via ferramentas. Isso não funciona com modelos Gemma (sem suporte a ferramentas do vault). O Gemini CLI pode ler arquivos via shell, mas o formato da resposta pode diferir.

## Anexos de Arquivos

Anexe arquivos diretamente: Imagens (PNG, JPEG, GIF, WebP), PDFs, Arquivos de texto

## Chamada de Funções (Operações no Vault)

A IA pode interagir com seu vault usando estas ferramentas:

| Ferramenta | Descrição |
|------------|-----------|
| `read_note` | Ler conteúdo de nota |
| `create_note` | Criar novas notas |
| `propose_edit` | Editar com diálogo de confirmação |
| `propose_delete` | Excluir com diálogo de confirmação |
| `bulk_propose_edit` | Editar múltiplos arquivos em massa com diálogo de seleção |
| `bulk_propose_delete` | Excluir múltiplos arquivos em massa com diálogo de seleção |
| `search_notes` | Buscar no vault por nome ou conteúdo |
| `list_notes` | Listar notas em pasta |
| `rename_note` | Renomear/mover notas |
| `create_folder` | Criar novas pastas |
| `list_folders` | Listar pastas no vault |
| `get_active_note_info` | Obter informações sobre nota ativa |
| `get_rag_sync_status` | Verificar status de sincronização RAG |

## Edição Segura

Quando a IA usa `propose_edit`:
1. Um diálogo de confirmação mostra as alterações propostas
2. Clique em **Apply** para gravar as alterações no arquivo
3. Clique em **Discard** para cancelar sem modificar o arquivo

> As alterações NÃO são gravadas até você confirmar.

## Histórico de Edições

Rastreie e restaure alterações feitas em suas notas:

- **Rastreamento automático** - Todas as edições de IA (chat, workflow) e alterações manuais são registradas
- **Ver histórico** - Comando: "Show edit history" ou use a paleta de comandos
- **Visualização de diff** - Veja exatamente o que mudou com adições/exclusões coloridas
- **Restaurar** - Reverta para qualquer versão anterior com um clique
- **Modal redimensionável** - Arraste para mover, redimensione pelos cantos

**Exibição de diff:**
- Linhas `+` existiam na versão anterior
- Linhas `-` foram adicionadas na versão mais nova

**Como funciona:**

O histórico de edições usa uma abordagem baseada em snapshots:

1. **Criação do snapshot** - Quando um arquivo é aberto pela primeira vez ou modificado pela IA, um snapshot de seu conteúdo é salvo
2. **Registro de diff** - Quando o arquivo é modificado, a diferença entre o novo conteúdo e o snapshot é registrada como uma entrada de histórico
3. **Atualização do snapshot** - O snapshot é atualizado para o novo conteúdo após cada modificação
4. **Restaurar** - Para restaurar para uma versão anterior, os diffs são aplicados em reverso a partir do snapshot

**Quando o histórico é registrado:**
- Edições de chat da IA (ferramenta `propose_edit`)
- Modificações de notas de workflow (nó `note`)
- Salvamentos manuais via comando
- Auto-detecção quando o arquivo difere do snapshot ao abrir

**Local de armazenamento:**
- Arquivos de histórico: `{workspaceFolder}/history/{filename}.history.md`
- Arquivos de snapshot: `{workspaceFolder}/history/{filename}.snapshot.md`

**Configurações:**
- Habilitar/desabilitar nas configurações do plugin
- Configurar linhas de contexto para diffs
- Definir limites de retenção (máximo de entradas por arquivo, idade máxima)

![Modal de Histórico de Edições](edit_history.png)

## RAG

Geração Aumentada por Recuperação para busca inteligente no vault:

- **Arquivos suportados** - Markdown, PDF, Imagens (PNG, JPEG, GIF, WebP)
- **Modo interno** - Sincronizar arquivos do vault com o Google File Search
- **Modo externo** - Usar IDs de stores existentes
- **Sincronização incremental** - Enviar apenas arquivos alterados
- **Pastas de destino** - Especificar pastas a incluir
- **Padrões de exclusão** - Padrões regex para excluir arquivos

![Configurações RAG](setting_rag.png)

---

# Construtor de Workflows

Construa workflows automatizados de múltiplas etapas diretamente em arquivos Markdown. **Não é necessário conhecimento de programação** - apenas descreva o que você quer em linguagem natural, e a IA criará o workflow para você.

![Editor Visual de Workflows](visual_workflow.png)

## Criação de Workflows com IA

**Você não precisa aprender sintaxe YAML ou tipos de nós.** Simplesmente descreva seu workflow em linguagem simples:

1. Abra a aba **Workflow** na barra lateral do Gemini
2. Selecione **+ New (AI)** no menu dropdown
3. Descreva o que você quer: *"Crie um workflow que resuma a nota selecionada e salve em uma pasta de resumos"*
4. Clique em **Generate** - a IA cria o workflow completo

![Criar Workflow com IA](create_workflow_with_ai.png)

**Modifique workflows existentes da mesma forma:**
1. Carregue qualquer workflow
2. Clique no botão **AI Modify**
3. Descreva as alterações: *"Adicione uma etapa para traduzir o resumo para japonês"*
4. Revise e aplique

![Modificação de Workflow com IA](modify_workflow_with_ai.png)

## Início Rápido (Manual)

Você também pode escrever workflows manualmente. Adicione um bloco de código workflow a qualquer arquivo Markdown:

````markdown
```workflow
name: Quick Summary
nodes:
  - id: input
    type: dialog
    title: Enter topic
    inputTitle: Topic
    saveTo: topic
  - id: generate
    type: command
    prompt: "Write a brief summary about {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Abra a aba **Workflow** na barra lateral do Gemini para executá-lo.

## Tipos de Nós Disponíveis

22 tipos de nós estão disponíveis para construção de workflows:

| Categoria | Nós |
|-----------|-----|
| Variáveis | `variable`, `set` |
| Controle | `if`, `while` |
| LLM | `command` |
| Dados | `http`, `json` |
| Notas | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Arquivos | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composição | `workflow` |
| RAG | `rag-sync` |
| Externo | `mcp`, `obsidian-command` |

> **Para especificações detalhadas de nós e exemplos, veja [WORKFLOW_NODES_pt.md](WORKFLOW_NODES_pt.md)**

## Modo de Atalho

Atribua atalhos de teclado para executar workflows instantaneamente:

1. Adicione um campo `name:` ao seu workflow
2. Abra o arquivo de workflow e selecione o workflow no dropdown
3. Clique no ícone de teclado (⌨️) no rodapé do painel Workflow
4. Vá para Settings → Hotkeys → pesquise "Workflow: [Nome do Seu Workflow]"
5. Atribua um atalho (ex.: `Ctrl+Shift+T`)

Quando acionado por atalho:
- `prompt-file` usa o arquivo ativo automaticamente (sem diálogo)
- `prompt-selection` usa a seleção atual, ou o conteúdo completo do arquivo se não houver seleção

## Gatilhos de Eventos

Workflows podem ser acionados automaticamente por eventos do Obsidian:

![Configurações de Gatilho de Evento](event_setting.png)

| Evento | Descrição |
|--------|-----------|
| File Created | Acionado quando um novo arquivo é criado |
| File Modified | Acionado quando um arquivo é salvo (debounce de 5s) |
| File Deleted | Acionado quando um arquivo é excluído |
| File Renamed | Acionado quando um arquivo é renomeado |
| File Opened | Acionado quando um arquivo é aberto |

**Configuração de gatilho de evento:**
1. Adicione um campo `name:` ao seu workflow
2. Abra o arquivo de workflow e selecione o workflow no dropdown
3. Clique no ícone de raio (⚡) no rodapé do painel Workflow
4. Selecione quais eventos devem acionar o workflow
5. Opcionalmente adicione um filtro de padrão de arquivo

**Exemplos de padrão de arquivo:**
- `**/*.md` - Todos os arquivos Markdown em qualquer pasta
- `journal/*.md` - Arquivos Markdown somente na pasta journal
- `*.md` - Arquivos Markdown somente na pasta raiz
- `**/{daily,weekly}/*.md` - Arquivos nas pastas daily ou weekly
- `projects/[a-z]*.md` - Arquivos começando com letra minúscula

**Variáveis de evento:** Quando acionado por um evento, estas variáveis são definidas automaticamente:

| Variável | Descrição |
|----------|-----------|
| `__eventType__` | Tipo de evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Caminho do arquivo afetado |
| `__eventFile__` | JSON com informações do arquivo (path, basename, name, extension) |
| `__eventFileContent__` | Conteúdo do arquivo (para eventos create/modify/file-open) |
| `__eventOldPath__` | Caminho anterior (somente para eventos rename) |

> **Nota:** Os nós `prompt-file` e `prompt-selection` usam automaticamente o arquivo do evento quando acionados por eventos. `prompt-selection` usa o conteúdo inteiro do arquivo como seleção.

---

# Comum

## Modelos Suportados

### Plano Pago
| Modelo | Descrição |
|--------|-----------|
| Gemini 3 Flash Preview | Modelo rápido, contexto de 1M (padrão) |
| Gemini 3 Pro Preview | Modelo principal, contexto de 1M |
| Gemini 2.5 Flash Lite | Modelo flash leve |
| Gemini 2.5 Flash (Image) | Geração de imagens, 1024px |
| Gemini 3 Pro (Image) | Geração de imagens Pro, 4K |

### Plano Gratuito
| Modelo | Operações no Vault |
|--------|---------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Instalação

### BRAT (Recomendado)
1. Instale o plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Abra as configurações do BRAT → "Add Beta plugin"
3. Digite: `https://github.com/takeshy/obsidian-gemini-helper`
4. Ative o plugin nas configurações de Community plugins

### Manual
1. Baixe `main.js`, `manifest.json`, `styles.css` das releases
2. Crie a pasta `gemini-helper` em `.obsidian/plugins/`
3. Copie os arquivos e ative nas configurações do Obsidian

### A partir do Código-fonte
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configuração

### Configurações de API
1. Obtenha a chave de API em [ai.google.dev](https://ai.google.dev)
2. Digite nas configurações do plugin
3. Selecione o plano de API (Gratuito/Pago)

![Configurações Básicas](setting_basic.png)

### Modo CLI (Gemini / Claude / Codex)

**Gemini CLI:**
1. Instale o [Gemini CLI](https://github.com/google-gemini/gemini-cli)
2. Autentique com `gemini` → `/auth`
3. Clique em "Verify" na seção Gemini CLI

**Claude CLI:**
1. Instale o [Claude Code](https://github.com/anthropics/claude-code): `npm install -g @anthropic-ai/claude-code`
2. Autentique com `claude`
3. Clique em "Verify" na seção Claude CLI

**Codex CLI:**
1. Instale o [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
2. Autentique com `codex`
3. Clique em "Verify" na seção Codex CLI

**Limitações do CLI:** Operações no vault somente leitura, sem busca semântica/web

### Configurações de Workspace
- **Workspace Folder** - Localização do histórico de chat e configurações
- **System Prompt** - Instruções adicionais para a IA
- **Tool Limits** - Controlar limites de chamadas de função
- **Edit History** - Rastrear e restaurar alterações feitas pela IA

![Limites de Ferramentas e Histórico de Edições](setting_tool_history.png)

### Comandos de Barra
- Definir templates de prompt personalizados acionados por `/`
- Override opcional de modelo e busca por comando

![Comandos de Barra](setting_slash_command.png)

## Uso

### Abrindo o Chat
- Clique no ícone do Gemini na ribbon
- Comando: "Gemini Helper: Open chat"
- Alternar: "Gemini Helper: Toggle chat / editor"

### Controles do Chat
- **Enter** - Enviar mensagem
- **Shift+Enter** - Nova linha
- **Botão Stop** - Parar geração
- **Botão +** - Novo chat
- **Botão History** - Carregar chats anteriores

### Usando Workflows
1. Abra a aba **Workflow** na barra lateral
2. Abra um arquivo com bloco de código `workflow`
3. Selecione o workflow no dropdown
4. Clique em **Run** para executar
5. Clique em **History** para ver execuções anteriores

![Histórico de Workflow](workflow_history.png)

**Exportar para Canvas:** Visualize o histórico de execução como um Canvas do Obsidian para análise visual.

![Visualização do Canvas de Histórico](history_canvas.png)

### Geração de Workflow com IA

**Criar Novo Workflow com IA:**
1. Selecione **+ New (AI)** no dropdown de workflow
2. Digite o nome do workflow e caminho de saída (suporta variável `{{name}}`)
3. Descreva o que o workflow deve fazer em linguagem natural
4. Selecione um modelo e clique em **Generate**
5. O workflow é automaticamente criado e salvo

**Modificar Workflow Existente com IA:**
1. Carregue um workflow existente
2. Clique no botão **AI Modify** (ícone de brilho)
3. Descreva as alterações que você deseja
4. Revise a comparação antes/depois
5. Clique em **Apply Changes** para atualizar

![Modificação de Workflow com IA](modify_workflow_with_ai.png)

**Edição Manual de Workflow:**

Edite workflows diretamente no editor visual de nós com interface drag-and-drop.

![Edição Manual de Workflow](modify_workflow_manual.png)

**Recarregar do Arquivo:**
- Selecione **Reload from file** no dropdown para reimportar o workflow do arquivo markdown

## Requisitos

- Obsidian v0.15.0+
- Chave de API do Google AI, ou ferramenta CLI (Gemini CLI / Claude CLI / Codex CLI)
- Desktop e mobile suportados (modo CLI: somente desktop)

## Privacidade

**Dados armazenados localmente:**
- Chave de API (armazenada nas configurações do Obsidian)
- Histórico de chat (como arquivos Markdown)
- Histórico de execução de workflows

**Dados enviados ao Google:**
- Todas as mensagens de chat e anexos de arquivos são enviados à API do Google Gemini para processamento
- Quando RAG está habilitado, arquivos do vault são enviados ao Google File Search
- Quando Busca na Web está habilitada, consultas são enviadas ao Google Search

**Dados enviados a serviços de terceiros:**
- Nós `http` de workflow podem enviar dados para qualquer URL especificada no workflow

**Provedores CLI (opcional):**
- Quando o modo CLI está habilitado, ferramentas CLI externas (gemini, claude, codex) são executadas via child_process
- Isso só ocorre quando explicitamente configurado e verificado pelo usuário
- O modo CLI é somente para desktop (não disponível em mobile)

**Notas de segurança:**
- Revise workflows antes de executar - nós `http` podem transmitir dados do vault para endpoints externos
- Nós `note` de workflow mostram um diálogo de confirmação antes de gravar arquivos (comportamento padrão)
- Comandos de barra com `confirmEdits: false` aplicarão edições de arquivo automaticamente sem mostrar botões Apply/Discard

Veja os [Termos de Serviço do Google AI](https://ai.google.dev/terms) para políticas de retenção de dados.

## Licença

MIT

## Links

- [Documentação da API Gemini](https://ai.google.dev/docs)
- [Documentação de Plugins do Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Apoie

Se você achar este plugin útil, considere me pagar um café!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
