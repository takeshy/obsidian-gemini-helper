# GemiHub Connection (Google Drive Sync)

Sincroniza tu vault de Obsidian con Google Drive, totalmente compatible con [GemiHub](https://gemihub.com). Edita notas en Obsidian y accede a ellas desde la interfaz web de GemiHub, o viceversa.

## Descripcion General

- **Sincronizacion bidireccional** - Push de cambios locales a Drive, pull de cambios remotos a Obsidian
- **Compatible con GemiHub** - Usa el mismo formato `_sync-meta.json` y autenticacion cifrada de GemiHub
- **Resolucion de conflictos** - Detecta y resuelve conflictos cuando ambos lados editan el mismo archivo
- **Sincronizacion selectiva** - Excluye archivos/carpetas con coincidencia de patrones
- **Soporte binario** - Sincroniza imagenes, PDFs y otros archivos binarios

## Requisitos Previos

Necesitas una cuenta de [GemiHub](https://gemihub.com) con la sincronizacion de Google Drive configurada. El plugin usa el token de autenticacion cifrado de GemiHub para conectarse a tu Google Drive.

1. Inicia sesion en GemiHub
2. Ve a **Settings** → seccion **Obsidian Sync**
3. Copia el **Backup token**

## Configuracion

1. Abre Obsidian **Settings** → **Gemini Helper** → desplazate hasta **Google Drive sync**
2. Activa **Enable drive sync**
3. Pega el **Backup token** de GemiHub
4. Haz clic en **Setup** para obtener la autenticacion cifrada de Google Drive
5. Ingresa tu **password** para desbloquear la sincronizacion de la sesion actual

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

### Pull

Descarga los cambios remotos al vault.

1. Obtiene el `_sync-meta.json` remoto
2. Calcula checksums locales para detectar cambios locales
3. Si existen conflictos, muestra el modal de resolucion de conflictos
4. Elimina los archivos que solo existen localmente (se mueven a la papelera de Obsidian)
5. Descarga archivos remotos nuevos/modificados al vault
6. Actualiza los metadatos de sincronizacion locales

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

## Gestion de Datos

### Papelera

Los archivos eliminados durante la sincronizacion se mueven a la carpeta `trash/` en Drive en lugar de eliminarse permanentemente. Desde la configuracion, puedes:

- **Restore** - Mover archivos de vuelta de la papelera a la carpeta raiz
- **Delete permanently** - Eliminar archivos permanentemente de Drive

### Respaldos de Conflictos

Cuando se resuelven conflictos, la version descartada se guarda en `sync_conflicts/` en Drive. Puedes:

- **Restore** - Restaurar un respaldo a la carpeta raiz (sobrescribe la version actual)
- **Delete** - Eliminar respaldos permanentemente

### Archivos Temporales

Los archivos guardados temporalmente por GemiHub se almacenan en `__TEMP__/` en Drive. Puedes:

- **Apply** - Aplicar el contenido del archivo temporal al archivo correspondiente en Drive
- **Delete** - Eliminar archivos temporales

Los tres modales de gestion soportan vista previa de archivos y operaciones por lotes.

## Configuracion

| Ajuste | Descripcion | Predeterminado |
|---|---|---|
| **Enable drive sync** | Activar/desactivar la funcion de sincronizacion | Off |
| **Backup token** | Pegar desde la configuracion de GemiHub (seccion Obsidian Sync) | - |
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
- Si has cambiado tu password en GemiHub, usa **Reset auth** en la configuracion y vuelve a configurar con un nuevo backup token

### El modal de conflictos sigue apareciendo

Ambos lados tienen cambios. Resuelve todos los conflictos eligiendo local o remoto para cada archivo. Despues de resolver todos los conflictos, el pull continua automaticamente.
