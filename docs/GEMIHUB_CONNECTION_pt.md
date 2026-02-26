# GemiHub Connection (Google Drive Sync)

Sincronize seu vault do Obsidian com o Google Drive, totalmente compatível com o [GemiHub](https://gemihub.online). Edite notas no Obsidian e acesse-as pela interface web do GemiHub, ou vice-versa.

## O que é o GemiHub?

[GemiHub](https://gemihub.online) é uma aplicação web que transforma o Google Gemini em um assistente de IA pessoal integrado ao seu Google Drive.

![Interface do GemiHub](images/gemihub_connection/push_pull.png)

### Recursos exclusivos do GemiHub

Estes recursos estão disponíveis apenas através da interface web do GemiHub e não podem ser replicados apenas pelo plugin do Obsidian:

- **Automatic RAG** - Arquivos sincronizados com o GemiHub são automaticamente indexados para busca semântica. Diferente da sincronização manual de RAG do plugin do Obsidian, o GemiHub indexa arquivos a cada sincronização sem configuração adicional.
- **OAuth2-enabled MCP** - Use servidores MCP que requerem autenticação OAuth2 (ex.: Google Calendar, Gmail, Google Docs). O plugin do Obsidian suporta apenas autenticação MCP baseada em cabeçalhos.
- **Conversão de Markdown para PDF/HTML** - Converta suas notas Markdown em documentos PDF ou HTML formatados diretamente no GemiHub.
- **Publicação pública** - Publique documentos HTML/PDF convertidos com uma URL pública compartilhável, facilitando o compartilhamento externo de notas.

### Recursos adicionados ao Obsidian através da conexão

Ao ativar a sincronização com o Google Drive, estes recursos ficam disponíveis no lado do Obsidian:

- **Sincronização bidirecional com pré-visualização de diff** - Push e pull de arquivos com uma lista detalhada de arquivos e visualização de diff unificado antes de confirmar alterações
- **Resolução de conflitos com diff** - Quando o mesmo arquivo é editado em ambos os lados, um modal de conflito mostra um diff unificado com código de cores para ajudá-lo a decidir qual versão manter
- **Histórico de edições do Drive** - Rastreie alterações feitas tanto no Obsidian quanto no GemiHub, com entradas de histórico por arquivo mostrando a origem (local/remoto)
- **Gerenciamento de backups de conflitos** - Navegue, visualize e restaure backups de conflitos armazenados no Drive

## Visão Geral da Sincronização

- **Sincronização bidirecional** - Push de alterações locais para o Drive, pull de alterações remotas para o Obsidian
- **Compatível com GemiHub** - Usa o mesmo formato `_sync-meta.json` e autenticação criptografada do GemiHub
- **Resolução de conflitos** - Detecta e resolve conflitos quando ambos os lados editam o mesmo arquivo
- **Sincronização seletiva** - Exclua arquivos/pastas com correspondência de padrões
- **Suporte a binários** - Sincroniza imagens, PDFs e outros arquivos binários

## Pré-requisitos

Você precisa de uma conta [GemiHub](https://gemihub.online) com sincronização do Google Drive configurada. O plugin usa o token de autenticação criptografado do GemiHub para se conectar ao seu Google Drive.

1. Faça login no GemiHub
2. Vá para **Settings** → seção **Obsidian Sync**
3. Copie o **Migration Tool token**

![Migration Tool Token](images/gemihub_connection/migration_tool.png)

## Configuração

1. Abra Obsidian **Settings** → **Gemini Helper** → role até **Google Drive sync**
2. Ative **Enable drive sync**

![Ativar sincronização do Drive](images/gemihub_connection/setting_drive_sync.png)

3. Cole o **Migration Tool token** do GemiHub
4. Clique em **Setup** para buscar a autenticação criptografada do Google Drive

![Configuração do Migration Tool Token](images/gemihub_connection/setting_migration_tool_token.png)

5. Digite sua **senha** para desbloquear a sincronização na sessão atual

![Desbloqueio do Drive Sync](images/gemihub_connection/start_with_sync.png)

> A cada reinicialização do Obsidian, você será solicitado a digitar sua senha para desbloquear a sessão de sincronização.

## Como a Sincronização Funciona

### Armazenamento de Arquivos no Drive

Todos os arquivos do vault são armazenados de forma **plana** na pasta raiz do Drive. O nome do arquivo no Drive inclui o caminho completo do vault:

| Caminho no vault | Nome do arquivo no Drive |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

Isso significa que não há subpastas no Drive (exceto pastas do sistema como `trash/`, `sync_conflicts/`, `__TEMP__/`). O GemiHub usa a mesma estrutura plana.

### Metadados de Sincronização

Dois arquivos de metadados rastreiam o estado da sincronização:

- **`_sync-meta.json`** (no Drive) - Compartilhado com o GemiHub. Contém IDs de arquivos, checksums e timestamps de todos os arquivos sincronizados.
- **`{workspaceFolder}/drive-sync-meta.json`** (local) - Mapeia caminhos do vault para IDs de arquivos no Drive e armazena checksums da última sincronização.

### Push

Envia alterações locais para o Google Drive.

1. Calcula checksums MD5 de todos os arquivos do vault
2. Compara com os metadados de sincronização locais para encontrar arquivos alterados
3. Se o remoto tiver alterações pendentes, o push é rejeitado (faça pull primeiro)
4. Envia arquivos novos/modificados para o Drive
5. Move arquivos deletados localmente para `trash/` no Drive (exclusão suave)
6. Atualiza `_sync-meta.json` no Drive

![Push para o Drive](images/gemihub_connection/push.png)

### Pull

Baixa alterações remotas para o vault.

1. Busca o `_sync-meta.json` remoto
2. Calcula checksums locais para detectar alterações locais
3. Se existirem conflitos, mostra o modal de resolução de conflitos
4. Deleta arquivos que existem apenas localmente (movidos para a lixeira do Obsidian)
5. Baixa arquivos remotos novos/modificados para o vault
6. Atualiza os metadados de sincronização locais

![Pull para local](images/gemihub_connection/pull_to_local.png)

### Full Pull

Substitui todos os arquivos locais pelas versões remotas. Use isso para resetar seu vault para corresponder ao Drive.

> **Aviso:** Isso deleta arquivos locais que não estão presentes no Drive (movidos para a lixeira do Obsidian).

### Resolução de Conflitos

Quando o mesmo arquivo é modificado tanto localmente quanto remotamente:

- Um modal mostra todos os arquivos em conflito
- Para cada arquivo, escolha **Keep local** ou **Keep remote**
- A versão preterida é salva como backup em `sync_conflicts/` no Drive
- **Conflitos de edição-exclusão** (editado localmente, deletado remotamente) oferecem **Restore (push to drive)** ou **Accept delete**
- Ações em massa: **Keep all local** / **Keep all remote**

![Resolução de conflitos](images/gemihub_connection/conflict.png)

Clique em **Diff** para ver um diff unificado com código de cores entre as versões local e remota:

![Vista de diff de conflitos](images/gemihub_connection/conflict_diff.png)

## Gerenciamento de Dados

### Lixeira

Arquivos deletados durante a sincronização são movidos para a pasta `trash/` no Drive em vez de serem permanentemente deletados. Nas configurações, você pode:

- **Restore** - Mover arquivos de volta da lixeira para a pasta raiz
- **Delete permanently** - Remover arquivos permanentemente do Drive

### Backups de Conflitos

Quando conflitos são resolvidos, a versão preterida é salva em `sync_conflicts/` no Drive. Você pode:

- **Restore** - Restaurar um backup para a pasta raiz (sobrescreve a versão atual)
- **Delete** - Remover backups permanentemente

![Backups de conflitos](images/gemihub_connection/conflict_backup.png)

### Arquivos Temporários

Arquivos temporariamente salvos pelo GemiHub são armazenados em `__TEMP__/` no Drive. Você pode:

- **Apply** - Aplicar o conteúdo do arquivo temporário ao arquivo correspondente no Drive
- **Delete** - Remover arquivos temporários

Todos os três modais de gerenciamento suportam pré-visualização de arquivos e operações em lote.

## Configurações

| Configuração | Descrição | Padrão |
|---|---|---|
| **Enable drive sync** | Alternar o recurso de sincronização | Off |
| **Migration Tool token** | Cole das configurações do GemiHub (seção Obsidian Sync) | - |
| **Auto sync check** | Verificar periodicamente alterações remotas e atualizar contagens | Off |
| **Sync check interval** | Frequência de verificação (minutos) | 5 |
| **Exclude patterns** | Caminhos a excluir (um por linha, suporta curingas `*`) | `node_modules/` |

## Comandos

Quatro comandos estão disponíveis na paleta de comandos:

| Comando | Descrição |
|---|---|
| **Drive sync: push to drive** | Push de alterações locais para o Drive |
| **Drive sync: pull to local** | Pull de alterações remotas para o vault |
| **Drive sync: full push to drive** | Push de todos os arquivos locais para o Drive |
| **Drive sync: full pull to local** | Substituir todos os arquivos locais pelas versões remotas |

## Arquivos Excluídos

Os seguintes são sempre excluídos da sincronização:

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Diretório de configuração do Obsidian (`.obsidian/` ou personalizado)
- Padrões de exclusão definidos pelo usuário nas configurações

### Sintaxe de Padrões de Exclusão

- `folder/` - Excluir uma pasta e seu conteúdo
- `*.tmp` - Padrão glob (corresponde a qualquer arquivo `.tmp`)
- `*.log` - Padrão glob (corresponde a qualquer arquivo `.log`)
- `drafts/` - Excluir a pasta `drafts`

## Solução de Problemas

### "Remote has pending changes. Please pull first."

O Drive remoto tem alterações que ainda não foram baixadas. Execute **Pull to local** antes de fazer push.

### "Drive sync: no remote data found. Push first."

Nenhum `_sync-meta.json` existe no Drive. Execute **Push to drive** para inicializar a sincronização.

### Falha ao desbloquear com senha

- Verifique se você está usando a mesma senha do GemiHub
- Se você alterou sua senha no GemiHub, use **Reset auth** nas configurações e reconfigure com um novo Migration Tool token

### O modal de conflitos continua aparecendo

Ambos os lados têm alterações. Resolva todos os conflitos escolhendo local ou remoto para cada arquivo. Após resolver todos os conflitos, o pull continua automaticamente.
