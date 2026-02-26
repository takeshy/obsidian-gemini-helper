# GemiHub Connection (Google Drive Sync)

Sincroniza tu vault de Obsidian con Google Drive, totalmente compatible con [GemiHub](https://gemihub.online). Edita notas en Obsidian y accede a ellas desde la interfaz web de GemiHub, o viceversa.

## Que es GemiHub?

[GemiHub](https://gemihub.online) es una aplicacion web que convierte a Google Gemini en un asistente de IA personal integrado con tu Google Drive.

![Interfaz de GemiHub](images/gemihub_connection/push_pull.png)

### Funciones exclusivas de GemiHub

Estas funciones solo estan disponibles a traves de la interfaz web de GemiHub y no pueden ser replicadas por el plugin de Obsidian solo:

- **Automatic RAG** - Los archivos sincronizados con GemiHub se indexan automaticamente para busqueda semantica. A diferencia de la sincronizacion RAG manual del plugin de Obsidian, GemiHub indexa los archivos en cada sincronizacion sin configuracion adicional.
- **OAuth2-enabled MCP** - Usa servidores MCP que requieren autenticacion OAuth2 (ej., Google Calendar, Gmail, Google Docs). El plugin de Obsidian solo soporta autenticacion MCP basada en headers.
- **Conversion de Markdown a PDF/HTML** - Convierte tus notas Markdown a documentos PDF o HTML formateados directamente en GemiHub.
- **Publicacion publica** - Publica documentos HTML/PDF convertidos con una URL publica compartible, facilitando compartir notas externamente.

### Funciones añadidas a Obsidian a traves de la conexion

Al habilitar la sincronizacion con Google Drive, estas funciones se vuelven disponibles en el lado de Obsidian:

- **Sincronizacion bidireccional con vista previa de diff** - Push y pull de archivos con una lista detallada de archivos y vista de diff unificado antes de confirmar los cambios
- **Resolucion de conflictos con diff** - Cuando el mismo archivo se edita en ambos lados, un modal de conflictos muestra un diff unificado con codigo de colores para ayudarte a decidir que version conservar
- **Historial de edicion en Drive** - Rastrea cambios realizados desde Obsidian y GemiHub, con entradas de historial por archivo mostrando el origen (local/remoto)
- **Gestion de copias de seguridad de conflictos** - Navega, previsualiza y restaura copias de seguridad de conflictos almacenadas en Drive

## Descripcion General de la Sincronizacion

- **Sincronizacion bidireccional** - Push de cambios locales a Drive, pull de cambios remotos a Obsidian
- **Compatible con GemiHub** - Usa el mismo formato `_sync-meta.json` y autenticacion cifrada de GemiHub
- **Resolucion de conflictos** - Detecta y resuelve conflictos cuando ambos lados editan el mismo archivo
- **Sincronizacion selectiva** - Excluye archivos/carpetas con coincidencia de patrones
- **Soporte binario** - Sincroniza imagenes, PDFs y otros archivos binarios

## Requisitos Previos

Necesitas una cuenta de [GemiHub](https://gemihub.online) con la sincronizacion de Google Drive configurada. El plugin usa el token de autenticacion cifrado de GemiHub para conectarse a tu Google Drive.

1. Inicia sesion en GemiHub
2. Ve a **Settings** → seccion **Obsidian Sync**
3. Copia el **Migration Tool token**

![Migration Tool Token](images/gemihub_connection/migration_tool.png)

## Configuracion

1. Abre Obsidian **Settings** → **Gemini Helper** → desplazate hasta **Google Drive sync**
2. Activa **Enable drive sync**

![Activar sincronizacion con Drive](images/gemihub_connection/setting_drive_sync.png)

3. Pega el **Migration Tool token** de GemiHub
4. Haz clic en **Setup** para obtener la autenticacion cifrada de Google Drive

![Configuracion del Migration Tool Token](images/gemihub_connection/setting_migration_tool_token.png)

5. Ingresa tu **password** para desbloquear la sincronizacion de la sesion actual

![Desbloqueo de Drive Sync](images/gemihub_connection/start_with_sync.png)

> En cada reinicio de Obsidian, se te pedira que ingreses tu password para desbloquear la sesion de sincronizacion.

## Como Funciona la Sincronizacion

### Almacenamiento de Archivos en Drive

Todos los archivos del vault se almacenan **de forma plana** en la carpeta raiz de Drive. El nombre del archivo en Drive incluye la ruta completa del vault:

| Ruta en el vault | Nombre del archivo en Drive |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

Esto significa que no hay subcarpetas en Drive (excepto las carpetas del sistema como `trash/`, `sync_conflicts/`, `__TEMP__/`). GemiHub usa la misma estructura plana.

### Metadatos de Sincronizacion

Dos archivos de metadatos rastrean el estado de sincronizacion:

- **`_sync-meta.json`** (en Drive) - Compartido con GemiHub. Contiene IDs de archivos, checksums y marcas de tiempo de todos los archivos sincronizados.
- **`{workspaceFolder}/drive-sync-meta.json`** (local) - Mapea rutas del vault a IDs de archivos en Drive y almacena los checksums de la ultima sincronizacion.

### Push

Sube los cambios locales a Google Drive.

1. Calcula checksums MD5 para todos los archivos del vault
2. Compara con los metadatos de sincronizacion locales para encontrar archivos modificados
3. Si el remoto tiene cambios pendientes, el push es rechazado (primero haz pull)
4. Sube archivos nuevos/modificados a Drive
5. Mueve los archivos eliminados localmente a `trash/` en Drive (eliminacion suave)
6. Actualiza `_sync-meta.json` en Drive

![Push a Drive](images/gemihub_connection/push.png)

### Pull

Descarga los cambios remotos al vault.

1. Obtiene el `_sync-meta.json` remoto
2. Calcula checksums locales para detectar cambios locales
3. Si existen conflictos, muestra el modal de resolucion de conflictos
4. Elimina los archivos que solo existen localmente (se mueven a la papelera de Obsidian)
5. Descarga archivos remotos nuevos/modificados al vault
6. Actualiza los metadatos de sincronizacion locales

![Pull a local](images/gemihub_connection/pull_to_local.png)

### Full Pull

Reemplaza todos los archivos locales con las versiones remotas. Usa esto para restablecer tu vault para que coincida con Drive.

> **Advertencia:** Esto elimina los archivos locales que no estan presentes en Drive (se mueven a la papelera de Obsidian).

### Resolucion de Conflictos

Cuando el mismo archivo es modificado tanto local como remotamente:

- Un modal muestra todos los archivos en conflicto
- Para cada archivo, elige **Keep local** o **Keep remote**
- La version descartada se respalda en `sync_conflicts/` en Drive
- **Conflictos de edicion-eliminacion** (editado localmente, eliminado remotamente) ofrecen **Restore (push to drive)** o **Accept delete**
- Acciones masivas: **Keep all local** / **Keep all remote**

![Resolucion de conflictos](images/gemihub_connection/conflict.png)

Haga clic en **Diff** para ver un diff unificado con codigo de colores entre las versiones local y remota:

![Vista de diff de conflictos](images/gemihub_connection/conflict_diff.png)

## Gestion de Datos

### Papelera

Los archivos eliminados durante la sincronizacion se mueven a la carpeta `trash/` en Drive en lugar de eliminarse permanentemente. Desde la configuracion, puedes:

- **Restore** - Mover archivos de vuelta de la papelera a la carpeta raiz
- **Delete permanently** - Eliminar archivos permanentemente de Drive

### Respaldos de Conflictos

Cuando se resuelven conflictos, la version descartada se guarda en `sync_conflicts/` en Drive. Puedes:

- **Restore** - Restaurar un respaldo a la carpeta raiz (sobrescribe la version actual)
- **Delete** - Eliminar respaldos permanentemente

![Copias de seguridad de conflictos](images/gemihub_connection/conflict_backup.png)

### Archivos Temporales

Los archivos guardados temporalmente por GemiHub se almacenan en `__TEMP__/` en Drive. Puedes:

- **Apply** - Aplicar el contenido del archivo temporal al archivo correspondiente en Drive
- **Delete** - Eliminar archivos temporales

Los tres modales de gestion soportan vista previa de archivos y operaciones por lotes.

## Configuracion

| Ajuste | Descripcion | Predeterminado |
|---|---|---|
| **Enable drive sync** | Activar/desactivar la funcion de sincronizacion | Off |
| **Migration Tool token** | Pegar desde la configuracion de GemiHub (seccion Obsidian Sync) | - |
| **Auto sync check** | Verificar periodicamente cambios remotos y actualizar contadores | Off |
| **Sync check interval** | Frecuencia de verificacion (minutos) | 5 |
| **Exclude patterns** | Rutas a excluir (una por linea, soporta comodines `*`) | `node_modules/` |

## Comandos

Cuatro comandos estan disponibles desde la paleta de comandos:

| Comando | Descripcion |
|---|---|
| **Drive sync: push to drive** | Push de cambios locales a Drive |
| **Drive sync: pull to local** | Pull de cambios remotos al vault |
| **Drive sync: full push to drive** | Push de todos los archivos locales a Drive |
| **Drive sync: full pull to local** | Reemplazar todos los archivos locales con las versiones remotas |

## Archivos Excluidos

Los siguientes siempre se excluyen de la sincronizacion:

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Directorio de configuracion de Obsidian (`.obsidian/` o personalizado)
- Patrones de exclusion definidos por el usuario en la configuracion

### Sintaxis de Patrones de Exclusion

- `folder/` - Excluir una carpeta y su contenido
- `*.tmp` - Patron glob (coincide con cualquier archivo `.tmp`)
- `*.log` - Patron glob (coincide con cualquier archivo `.log`)
- `drafts/` - Excluir la carpeta `drafts`

## Solucion de Problemas

### "Remote has pending changes. Please pull first."

El Drive remoto tiene cambios que aun no se han descargado. Ejecuta **Pull to local** antes de hacer push.

### "Drive sync: no remote data found. Push first."

No existe `_sync-meta.json` en Drive. Ejecuta **Push to drive** para inicializar la sincronizacion.

### Fallo al desbloquear con password

- Verifica que estas usando el mismo password que en GemiHub
- Si has cambiado tu password en GemiHub, usa **Reset auth** en la configuracion y vuelve a configurar con un nuevo Migration Tool token

### El modal de conflictos sigue apareciendo

Ambos lados tienen cambios. Resuelve todos los conflictos eligiendo local o remoto para cada archivo. Despues de resolver todos los conflictos, el pull continua automaticamente.
