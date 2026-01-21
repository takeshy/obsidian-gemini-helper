# Referencia de Nodos de Workflow

Este documento proporciona especificaciones detalladas para todos los tipos de nodos de workflow. Para la mayoria de los usuarios, **no necesitas aprender estos detalles** - simplemente describe lo que quieres en lenguaje natural, y la IA creara o modificara los workflows por ti.

## Resumen de Tipos de Nodos

| Categoria | Nodos | Descripcion |
|----------|-------|-------------|
| Variables | `variable`, `set` | Declarar y actualizar variables |
| Control | `if`, `while` | Ramificacion condicional y bucles |
| LLM | `command` | Ejecutar prompts con opciones de modelo/busqueda |
| Datos | `http`, `json` | Solicitudes HTTP y analisis JSON |
| Notas | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Operaciones de vault |
| Archivos | `file-explorer`, `file-save` | Seleccion y guardado de archivos (imagenes, PDFs, etc.) |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` | Dialogos de entrada de usuario |
| Composicion | `workflow` | Ejecutar otro workflow como sub-workflow |
| RAG | `rag-sync` | Sincronizar notas al almacen RAG |
| Externo | `mcp`, `obsidian-command` | Llamar servidores MCP externos o comandos de Obsidian |

---

## Opciones de Workflow

Puedes agregar una seccion `options` para controlar el comportamiento del workflow:

```yaml
name: My Workflow
options:
  showProgress: false  # Ocultar modal de progreso de ejecucion (predeterminado: true)
nodes:
  - id: step1
    type: command
    ...
```

| Opcion | Tipo | Predeterminado | Descripcion |
|--------|------|----------------|-------------|
| `showProgress` | boolean | `true` | Mostrar modal de progreso de ejecucion al ejecutar via hotkey o lista de workflows |

**Nota:** La opcion `showProgress` solo afecta la ejecucion via hotkey o lista de workflows. El panel Visual Workflow siempre muestra el progreso.

---

## Referencia de Nodos

### command

Ejecuta un prompt de LLM con configuraciones opcionales de modelo, busqueda, herramientas de vault y MCP.

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # Opcional: modelo especifico
  ragSetting: __websearch__      # Opcional: __websearch__, __none__, o nombre de configuracion
  vaultTools: all                # Opcional: all, noSearch, none
  mcpServers: "server1,server2"  # Opcional: nombres de servidores MCP separados por coma
  prompt: "Search for {{topic}}"
  saveTo: result
```

| Propiedad | Descripcion |
|----------|-------------|
| `prompt` | El prompt a enviar al LLM (requerido) |
| `model` | Sobrescribir el modelo actual (los modelos disponibles dependen de la configuracion del plan API) |
| `ragSetting` | `__websearch__` (busqueda web), `__none__` (sin busqueda), nombre de configuracion RAG, u omitir para actual |
| `vaultTools` | Modo de herramientas de vault: `all` (busqueda + lectura/escritura), `noSearch` (solo lectura/escritura), `none` (deshabilitado). Por defecto: `all` |
| `mcpServers` | Nombres de servidores MCP separados por coma para habilitar (deben estar configurados en los ajustes del plugin) |
| `attachments` | Nombres de variables separados por coma conteniendo FileExplorerData (del nodo `file-explorer`) |
| `saveTo` | Nombre de variable para almacenar respuesta de texto |
| `saveImageTo` | Nombre de variable para almacenar imagen generada (formato FileExplorerData, para modelos de imagen) |

**Ejemplo de generacion de imagen**:
```yaml
- id: generate
  type: command
  prompt: "Generate a cute cat illustration"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
```

**Modelos CLI:**

Puedes usar modelos CLI (`gemini-cli`, `claude-cli`, `codex-cli`) en workflows si el CLI esta configurado en los ajustes del plugin. Los modelos CLI son utiles para acceder a modelos insignia sin costos de API.

```yaml
- id: analyze
  type: command
  model: claude-cli
  prompt: "Analiza este codigo:\n\n{{code}}"
  saveTo: analysis
```

> **Nota:** Los modelos CLI no soportan RAG, busqueda web ni generacion de imagenes. Las propiedades `ragSetting` y `saveImageTo` se ignoran para modelos CLI.

### note

Escribe contenido en un archivo de nota.

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| Propiedad | Descripcion |
|----------|-------------|
| `path` | Ruta del archivo (requerido) |
| `content` | Contenido a escribir |
| `mode` | `overwrite` (predeterminado), `append`, o `create` (omitir si existe) |
| `confirm` | `true` (predeterminado) muestra dialogo de confirmacion, `false` escribe inmediatamente |
| `history` | `true` (predeterminado, sigue configuracion global) guarda en historial de edicion, `false` desactiva historial para esta escritura |

### note-read

Lee contenido de un archivo de nota.

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| Propiedad | Descripcion |
|----------|-------------|
| `path` | Ruta del archivo a leer (requerido) |
| `saveTo` | Nombre de variable para almacenar el contenido del archivo (requerido) |

**Soporte de Archivos Encriptados:**

Si el archivo objetivo esta encriptado (mediante la funcion de encriptacion del plugin), el workflow automaticamente:
1. Verifica si la contrasena ya esta cacheada en la sesion actual
2. Si no esta cacheada, solicita al usuario ingresar la contrasena
3. Descifra el contenido del archivo y lo almacena en la variable
4. Cachea la contrasena para lecturas posteriores (dentro de la misma sesion de Obsidian)

Una vez que ingreses la contrasena, no necesitas volver a ingresarla para otras lecturas de archivos encriptados hasta que reinicies Obsidian.

**Ejemplo: Leer clave API de archivo encriptado y llamar API externa**

Este workflow lee una clave API almacenada en un archivo encriptado, llama a una API externa y muestra el resultado:

```yaml
name: Llamar API con clave encriptada
nodes:
  - id: read-key
    type: note-read
    path: "secrets/api-key.md"
    saveTo: apiKey
    next: call-api

  - id: call-api
    type: http
    url: "https://api.example.com/data"
    method: GET
    headers: '{"Authorization": "Bearer {{apiKey}}"}'
    saveTo: response
    next: show-result

  - id: show-result
    type: dialog
    title: Respuesta API
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **Consejo:** Almacena datos sensibles como claves API en archivos encriptados. Usa el comando "Encriptar archivo" desde la paleta de comandos para encriptar un archivo que contenga tus secretos.

### note-list

Lista notas con filtrado y ordenamiento.

```yaml
- id: list
  type: note-list
  folder: "Projects"
  recursive: true
  tags: "todo, project"
  tagMatch: all
  createdWithin: "7d"
  modifiedWithin: "24h"
  sortBy: modified
  sortOrder: desc
  limit: 20
  saveTo: noteList
```

| Propiedad | Descripcion |
|----------|-------------|
| `folder` | Ruta de carpeta (vacio para todo el vault) |
| `recursive` | `true` incluye subcarpetas, `false` (predeterminado) solo hijos directos |
| `tags` | Etiquetas separadas por coma para filtrar (con o sin `#`) |
| `tagMatch` | `any` (predeterminado) o `all` las etiquetas deben coincidir |
| `createdWithin` | Filtrar por tiempo de creacion: `30m`, `24h`, `7d` |
| `modifiedWithin` | Filtrar por tiempo de modificacion |
| `sortBy` | `created`, `modified`, o `name` |
| `sortOrder` | `asc` o `desc` (predeterminado) |
| `limit` | Resultados maximos (predeterminado: 50) |
| `saveTo` | Variable para resultados |

**Formato de salida:**
```json
{
  "count": 5,
  "totalCount": 12,
  "hasMore": true,
  "notes": [
    {"name": "Note1", "path": "folder/Note1.md", "created": 1234567890, "modified": 1234567900, "tags": ["#todo"]}
  ]
}
```

### note-search

Busca notas por nombre o contenido.

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| Propiedad | Descripcion |
|-----------|-------------|
| `query` | Cadena de consulta de busqueda (requerido, soporta `{{variables}}`) |
| `searchContent` | `true` busca contenido de archivos, `false` (predeterminado) busca solo nombres de archivos |
| `limit` | Resultados maximos (predeterminado: 10) |
| `saveTo` | Variable para resultados (requerido) |

**Formato de salida:**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...contexto alrededor de la coincidencia..."}
  ]
}
```

Cuando `searchContent` es `true`, `matchedContent` incluye aproximadamente 50 caracteres antes y despues de la coincidencia para contexto.

### folder-list

Lista carpetas en el vault.

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| Propiedad | Descripcion |
|-----------|-------------|
| `folder` | Ruta de carpeta padre (vacio para todo el vault) |
| `saveTo` | Variable para resultados (requerido) |

**Formato de salida:**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

Las carpetas se ordenan alfabeticamente.

### open

Abre un archivo en Obsidian.

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| Propiedad | Descripcion |
|-----------|-------------|
| `path` | Ruta del archivo a abrir (requerido, soporta `{{variables}}`) |

Si la ruta no tiene extension `.md`, se agrega automaticamente.

### http

Realiza solicitudes HTTP.

```yaml
- id: fetch
  type: http
  url: "https://api.example.com/data"
  method: POST
  contentType: json
  headers: '{"Authorization": "Bearer {{token}}"}'
  body: '{"query": "{{searchTerm}}"}'
  saveTo: response
  saveStatus: statusCode
  throwOnError: "true"
```

| Propiedad | Descripcion |
|----------|-------------|
| `url` | URL de la solicitud (requerido) |
| `method` | `GET` (predeterminado), `POST`, `PUT`, `PATCH`, `DELETE` |
| `contentType` | `json` (predeterminado), `form-data`, `text` |
| `headers` | Objeto JSON o formato `Key: Value` (uno por linea) |
| `body` | Cuerpo de la solicitud (para POST/PUT/PATCH) |
| `saveTo` | Variable para el cuerpo de respuesta |
| `saveStatus` | Variable para codigo de estado HTTP |
| `throwOnError` | `true` para lanzar error en respuestas 4xx/5xx |

**Ejemplo de form-data** (carga de archivo binario con file-explorer):

```yaml
- id: select-pdf
  type: file-explorer
  path: "{{__eventFilePath__}}"
  extensions: "pdf,png,jpg"
  saveTo: fileData
- id: upload
  type: http
  url: "https://example.com/upload"
  method: POST
  contentType: form-data
  body: '{"file": "{{fileData}}"}'
  saveTo: response
```

Para `form-data`:
- FileExplorerData (del nodo `file-explorer`) se detecta automaticamente y se envia como binario
- Usa la sintaxis `fieldName:filename` para campos de archivo de texto (ej., `"file:report.html": "{{htmlContent}}"`)

### json

Parsea una cadena JSON en un objeto para acceso a propiedades.

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| Propiedad | Descripcion |
|-----------|-------------|
| `source` | Nombre de variable que contiene la cadena JSON (requerido) |
| `saveTo` | Nombre de variable para el resultado parseado (requerido) |

Despues del parseo, accede a las propiedades usando notacion de punto: `{{data.items[0].name}}`

**JSON en bloques de codigo markdown:**

El nodo `json` extrae automaticamente JSON de bloques de codigo markdown:

```yaml
# Si la respuesta contiene:
# ```json
# {"status": "ok"}
# ```
# El nodo json extraera y parseara solo el contenido JSON
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

Esto es util cuando una respuesta LLM envuelve JSON en cercas de codigo.

### dialog

Muestra un dialogo con opciones, botones y/o entrada de texto.

```yaml
- id: ask
  type: dialog
  title: Select Options
  message: Choose items to process
  markdown: true
  options: "Option A, Option B, Option C"
  multiSelect: true
  inputTitle: "Additional notes"
  multiline: true
  defaults: '{"input": "default text", "selected": ["Option A"]}'
  button1: Confirm
  button2: Cancel
  saveTo: dialogResult
```

| Propiedad | Descripcion |
|----------|-------------|
| `title` | Titulo del dialogo |
| `message` | Contenido del mensaje (soporta `{{variables}}`) |
| `markdown` | `true` renderiza el mensaje como Markdown |
| `options` | Lista de opciones separadas por coma (opcional) |
| `multiSelect` | `true` para casillas de verificacion, `false` para botones de radio |
| `inputTitle` | Etiqueta para campo de entrada de texto (muestra entrada cuando se establece) |
| `multiline` | `true` para area de texto multilinea |
| `defaults` | JSON con valores iniciales de `input` y `selected` |
| `button1` | Etiqueta del boton primario (predeterminado: "OK") |
| `button2` | Etiqueta del boton secundario (opcional) |
| `saveTo` | Variable para el resultado (ver abajo) |

**Formato del resultado** (variable `saveTo`):
- `button`: string - texto del boton clickeado (ej: "Confirmar", "Cancelar")
- `selected`: string[] - **siempre un array**, incluso para seleccion unica (ej: `["Opcion A"]`)
- `input`: string - valor de entrada de texto (si se establecio `inputTitle`)

> **Importante:** Al verificar el valor seleccionado en una condicion `if`:
> - Para opcion unica: `{{dialogResult.selected[0]}} == Opcion A`
> - Para verificar si el array contiene valor (multiSelect): `{{dialogResult.selected}} contains Opcion A`
> - Incorrecto: `{{dialogResult.selected}} == Opcion A` (compara array con string, siempre false)

**Entrada de texto simple:**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

Ejecuta otro workflow como sub-workflow.

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| Propiedad | Descripcion |
|----------|-------------|
| `path` | Ruta al archivo de workflow (requerido) |
| `name` | Nombre del workflow (para archivos con multiples workflows) |
| `input` | Mapeo JSON de variables del sub-workflow a valores |
| `output` | Mapeo JSON de variables padre a resultados del sub-workflow |
| `prefix` | Prefijo para todas las variables de salida (cuando no se especifica `output`) |

### rag-sync

Sincroniza una nota a un almacen RAG.

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| Propiedad | Descripcion |
|----------|-------------|
| `path` | Ruta de la nota a sincronizar (requerido, soporta `{{variables}}`) |
| `ragSetting` | Nombre de configuracion RAG (requerido) |
| `saveTo` | Variable para almacenar resultado (opcional) |

**Formato de salida:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

Selecciona un archivo del vault o ingresa una nueva ruta de archivo. Soporta cualquier tipo de archivo incluyendo imagenes y PDFs.

```yaml
- id: selectImage
  type: file-explorer
  mode: select
  title: "Select an image"
  extensions: "png,jpg,jpeg,gif,webp"
  default: "images/"
  saveTo: imageData
  savePathTo: imagePath
```

| Propiedad | Descripcion |
|----------|-------------|
| `path` | Ruta directa del archivo - omite el dialogo cuando se establece (soporta `{{variables}}`) |
| `mode` | `select` (seleccionar archivo existente, predeterminado) o `create` (ingresar nueva ruta) |
| `title` | Titulo del dialogo |
| `extensions` | Extensiones permitidas separadas por coma (ej., `pdf,png,jpg`) |
| `default` | Ruta predeterminada (soporta `{{variables}}`) |
| `saveTo` | Variable para FileExplorerData JSON |
| `savePathTo` | Variable solo para la ruta del archivo |

**Formato de FileExplorerData:**
```json
{
  "path": "folder/image.png",
  "basename": "image.png",
  "name": "image",
  "extension": "png",
  "mimeType": "image/png",
  "contentType": "binary",
  "data": "base64-encoded-content"
}
```

**Ejemplo: Analisis de Imagen (con dialogo)**
```yaml
- id: selectImage
  type: file-explorer
  title: "Select an image to analyze"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image in detail"
  attachments: imageData
  saveTo: analysis
- id: save
  type: note
  path: "analysis/{{imageData.name}}.md"
  content: "# Image Analysis\n\n{{analysis}}"
```

**Ejemplo: Activado por evento (sin dialogo)**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: result
```

### file-save

Guarda FileExplorerData como un archivo en el vault. Util para guardar imagenes generadas o archivos copiados.

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| Propiedad | Descripcion |
|----------|-------------|
| `source` | Nombre de variable conteniendo FileExplorerData (requerido) |
| `path` | Ruta para guardar el archivo (extension se agrega automaticamente si falta) |
| `savePathTo` | Variable para almacenar la ruta final del archivo (opcional) |

**Ejemplo: Generar y guardar imagen**
```yaml
- id: generate
  type: command
  prompt: "Generate a landscape image"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save
  type: file-save
  source: generatedImage
  path: "images/landscape"
  savePathTo: savedPath
- id: showResult
  type: dialog
  title: "Image Saved"
  message: "Image saved to {{savedPath}}"
```

### prompt-file

Muestra selector de archivo o usa el archivo activo en modo hotkey/evento.

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| Propiedad | Descripcion |
|----------|-------------|
| `title` | Titulo del dialogo |
| `default` | Ruta predeterminada |
| `forcePrompt` | `true` siempre muestra dialogo, incluso en modo hotkey/evento |
| `saveTo` | Variable para contenido del archivo |
| `saveFileTo` | Variable para info del archivo JSON |

**Formato de info de archivo:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**Comportamiento por modo de activacion:**
| Modo | Comportamiento |
|------|----------|
| Panel | Muestra dialogo de selector de archivo |
| Hotkey | Usa archivo activo automaticamente |
| Evento | Usa archivo del evento automaticamente |

### prompt-selection

Obtiene texto seleccionado o muestra dialogo de seleccion.

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| Propiedad | Descripcion |
|----------|-------------|
| `saveTo` | Variable para texto seleccionado |
| `saveSelectionTo` | Variable para metadatos de seleccion JSON |

**Formato de info de seleccion:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**Comportamiento por modo de activacion:**
| Modo | Comportamiento |
|------|----------|
| Panel | Muestra dialogo de seleccion |
| Hotkey (con seleccion) | Usa seleccion actual |
| Hotkey (sin seleccion) | Usa contenido completo del archivo |
| Evento | Usa contenido completo del archivo |

### if / while

Ramificacion condicional y bucles.

```yaml
- id: branch
  type: if
  condition: "{{count}} > 10"
  trueNext: handleMany
  falseNext: handleFew

- id: loop
  type: while
  condition: "{{counter}} < {{total}}"
  trueNext: processItem
  falseNext: done
```

| Propiedad | Descripcion |
|----------|-------------|
| `condition` | Expresion con operadores: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains` |
| `trueNext` | ID del nodo cuando la condicion es verdadera |
| `falseNext` | ID del nodo cuando la condicion es falsa |

**El operador `contains`** funciona tanto con strings como con arrays:
- String: `{{text}} contains error` - verifica si "error" esta en el string
- Array: `{{dialogResult.selected}} contains Opcion A` - verifica si "Opcion A" esta en el array

> **Regla de referencia hacia atrás**: La propiedad `next` solo puede hacer referencia a nodos anteriores si el destino es un nodo `while`. Esto evita el código espagueti y garantiza una estructura de bucle adecuada.

### variable / set

Declara y actualiza variables.

```yaml
- id: init
  type: variable
  name: counter
  value: 0

- id: increment
  type: set
  name: counter
  value: "{{counter}} + 1"
```

**Variable especial `_clipboard`:**

Si establece una variable llamada `_clipboard`, su valor se copiará al portapapeles del sistema:

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

### mcp

Llama a una herramienta de servidor MCP (Model Context Protocol) remoto via HTTP.

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| Propiedad | Descripcion |
|----------|-------------|
| `url` | URL del endpoint del servidor MCP (requerido, soporta `{{variables}}`) |
| `tool` | Nombre de la herramienta a llamar en el servidor MCP (requerido) |
| `args` | Objeto JSON con argumentos de la herramienta (soporta `{{variables}}`) |
| `headers` | Objeto JSON con cabeceras HTTP (ej., para autenticacion) |
| `saveTo` | Nombre de variable para el resultado |

**Caso de uso:** Llamar servidores MCP remotos para consultas RAG, busqueda web, integraciones API, etc.

### obsidian-command

Ejecuta un comando de Obsidian por su ID. Esto permite que los workflows activen cualquier comando de Obsidian, incluyendo comandos de otros plugins.

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| Propiedad | Descripcion |
|----------|-------------|
| `command` | ID del comando a ejecutar (requerido, soporta `{{variables}}`) |
| `path` | Archivo a abrir antes de ejecutar el comando (opcional, la pestaña se cierra automáticamente después) |
| `saveTo` | Variable para almacenar el resultado de la ejecucion (opcional) |

**Formato de salida** (cuando `saveTo` esta configurado):
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**Encontrar IDs de comandos:**
1. Abrir Configuracion de Obsidian → Teclas de acceso rapido
2. Buscar el comando deseado
3. El ID del comando se muestra (ej., `editor:toggle-fold`, `app:reload`)

**IDs de comandos comunes:**
| ID del Comando | Descripcion |
|----------------|-------------|
| `editor:toggle-fold` | Alternar plegado en el cursor |
| `editor:fold-all` | Plegar todos los encabezados |
| `editor:unfold-all` | Desplegar todos los encabezados |
| `app:reload` | Recargar Obsidian |
| `workspace:close` | Cerrar panel actual |
| `file-explorer:reveal-active-file` | Revelar archivo en el explorador |

**Ejemplo: Workflow con comando de plugin**
```yaml
name: Escribir Registro de Trabajo
nodes:
  - id: get-content
    type: dialog
    inputTitle: "Ingrese contenido del registro"
    multiline: true
    saveTo: logContent
  - id: copy-to-clipboard
    type: set
    name: "_clipboard"
    value: "{{logContent.input}}"
  - id: write-to-log
    type: obsidian-command
    command: "work-log:write-from-clipboard"
```

**Caso de uso:** Activar comandos principales de Obsidian o comandos de otros plugins como parte de un workflow.

**Ejemplo: Cifrar todos los archivos en un directorio**

Este workflow cifra todos los archivos Markdown en una carpeta especificada usando el comando de cifrado de Gemini Helper:

```yaml
name: cifrar-carpeta
nodes:
  - id: init-index
    type: variable
    name: index
    value: "0"
  - id: list-files
    type: note-list
    folder: "private"
    recursive: "true"
    saveTo: fileList
  - id: loop
    type: while
    condition: "{{index}} < {{fileList.count}}"
    trueNext: encrypt
    falseNext: done
  - id: encrypt
    type: obsidian-command
    command: "gemini-helper:encrypt-file"
    path: "{{fileList.notes[index].path}}"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "Listo"
    message: "{{index}} archivos cifrados"
```

> **Nota:** La propiedad `path` abre el archivo, ejecuta el comando y luego cierra automáticamente la pestaña. Los archivos que ya están abiertos permanecen abiertos.

---

**Ejemplo: Consulta RAG con ragujuary**

[ragujuary](https://github.com/takeshy/ragujuary) es una herramienta CLI para gestionar Gemini File Search Stores con soporte de servidor MCP.

1. Instalar y configurar:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# Crear un almacen y subir archivos
ragujuary upload --create -s mystore ./docs

# Iniciar servidor MCP (usar --transport http, no sse)
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. Ejemplo de workflow:
```yaml
name: RAG Search
nodes:
  - id: query
    type: mcp
    url: "http://localhost:8080"
    tool: "query"
    args: '{"store_name": "mystore", "question": "How does authentication work?", "show_citations": true}'
    headers: '{"X-API-Key": "mysecretkey"}'
    saveTo: result
  - id: show
    type: dialog
    title: "Search Result"
    message: "{{result}}"
    markdown: true
    button1: "OK"
```

## Terminacion del Workflow

Usa `next: end` para terminar explicitamente el workflow:

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # El workflow termina aqui

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # Terminar workflow en rama verdadera
  falseNext: continue
```

## Expansion de Variables

Usa la sintaxis `{{variable}}` para referenciar variables:

```yaml
# Basico
path: "{{folder}}/{{filename}}.md"

# Acceso a Objeto/Array
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# Variables anidadas (para bucles)
path: "{{parsed.notes[{{counter}}].path}}"
```

### Modificador de Escape JSON

Usa `{{variable:json}}` para escapar el valor para incrustar en cadenas JSON. Esto escapa correctamente saltos de línea, comillas y otros caracteres especiales.

```yaml
# Sin :json - falla si el contenido tiene saltos de línea/comillas
args: '{"text": "{{content}}"}'  # ERROR si el contenido tiene caracteres especiales

# Con :json - seguro para cualquier contenido
args: '{"text": "{{content:json}}"}'  # OK - escapado correctamente
```

Esto es esencial cuando se pasa contenido de archivo o entrada de usuario a nodos `mcp` o `http` con cuerpos JSON.

## Nodos de Entrada Inteligente

Los nodos `prompt-selection` y `prompt-file` detectan automaticamente el contexto de ejecucion:

| Nodo | Modo Panel | Modo Hotkey | Modo Evento |
|------|------------|-------------|------------|
| `prompt-file` | Muestra selector de archivo | Usa archivo activo | Usa archivo del evento |
| `prompt-selection` | Muestra dialogo de seleccion | Usa seleccion o archivo completo | Usa contenido completo del archivo |

---

## Disparadores de Eventos

Los workflows pueden ser activados automaticamente por eventos de Obsidian.

![Event Trigger Settings](event_setting.png)

### Eventos Disponibles

| Evento | Descripcion |
|-------|-------------|
| `create` | Archivo creado |
| `modify` | Archivo modificado/guardado (con debounce de 5s) |
| `delete` | Archivo eliminado |
| `rename` | Archivo renombrado |
| `file-open` | Archivo abierto |

### Variables de Evento

Cuando se activa por un evento, estas variables se establecen automaticamente:

| Variable | Descripcion |
|----------|-------------|
| `__eventType__` | Tipo de evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Ruta del archivo afectado |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | Contenido del archivo (para eventos create/modify/file-open) |
| `__eventOldPath__` | Ruta anterior (solo para eventos rename) |

### Sintaxis de Patron de Archivo

Filtra eventos por ruta de archivo usando patrones glob:

| Patron | Coincide |
|---------|---------|
| `**/*.md` | Todos los archivos .md en cualquier carpeta |
| `journal/*.md` | Archivos .md directamente en carpeta journal |
| `*.md` | Archivos .md solo en carpeta raiz |
| `**/{daily,weekly}/*.md` | Archivos en carpetas daily o weekly |
| `projects/[a-z]*.md` | Archivos que comienzan con letra minuscula |
| `docs/**` | Todos los archivos bajo carpeta docs |

### Ejemplo de Workflow Activado por Evento

````markdown
```workflow
name: Auto-Tag New Notes
nodes:
  - id: getContent
    type: prompt-selection
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for this note:\n\n{{content}}"
    saveTo: tags
  - id: prepend
    type: note
    path: "{{__eventFilePath__}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**Configuracion:** Haz clic en el icono de rayo en el panel de Workflow, habilita "File Created", establece el patron `**/*.md`

---

## Ejemplos Practicos

### 1. Resumen de Nota

````markdown
```workflow
name: Note Summary
nodes:
  - id: select
    type: prompt-file
    title: Select note
    saveTo: content
    saveFileTo: fileInfo
  - id: parseFile
    type: json
    source: fileInfo
    saveTo: file
  - id: summarize
    type: command
    prompt: "Summarize this note:\n\n{{content}}"
    saveTo: summary
  - id: save
    type: note
    path: "summaries/{{file.name}}"
    content: "# Summary\n\n{{summary}}\n\n---\n*Source: {{file.path}}*"
    mode: create
```
````

### 2. Investigacion Web

````markdown
```workflow
name: Web Research
nodes:
  - id: topic
    type: dialog
    title: Research topic
    inputTitle: Topic
    saveTo: input
  - id: search
    type: command
    model: gemini-3-flash-preview
    ragSetting: __websearch__
    prompt: |
      Search the web for: {{input.input}}

      Include key facts, recent developments, and sources.
    saveTo: research
  - id: save
    type: note
    path: "research/{{input.input}}.md"
    content: "# {{input.input}}\n\n{{research}}"
    mode: overwrite
```
````

### 3. Procesamiento Condicional

````markdown
```workflow
name: Smart Summarizer
nodes:
  - id: input
    type: dialog
    title: Enter text to process
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: branch
    type: if
    condition: "{{userInput.input.length}} > 500"
    trueNext: summarize
    falseNext: enhance
  - id: summarize
    type: command
    prompt: "Summarize this long text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: enhance
    type: command
    prompt: "Expand and enhance this short text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: save
    type: note
    path: "processed/output.md"
    content: "{{result}}"
    mode: overwrite
```
````

### 4. Procesar Notas en Lote

````markdown
```workflow
name: Tag Analyzer
nodes:
  - id: init
    type: variable
    name: counter
    value: 0
  - id: initReport
    type: variable
    name: report
    value: "# Tag Suggestions\n\n"
  - id: list
    type: note-list
    folder: Clippings
    limit: 5
    saveTo: notes
  - id: json
    type: json
    source: notes
    saveTo: parsed
  - id: loop
    type: while
    condition: "{{counter}} < {{parsed.count}}"
    trueNext: read
    falseNext: finish
  - id: read
    type: note-read
    path: "{{parsed.notes[{{counter}}].path}}"
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for:\n\n{{content}}"
    saveTo: tags
  - id: append
    type: set
    name: report
    value: "{{report}}## {{parsed.notes[{{counter}}].name}}\n{{tags}}\n\n"
  - id: increment
    type: set
    name: counter
    value: "{{counter}} + 1"
    next: loop
  - id: finish
    type: note
    path: "reports/tag-suggestions.md"
    content: "{{report}}"
    mode: overwrite
```
````

### 5. Integracion API

````markdown
```workflow
name: Weather Report
nodes:
  - id: city
    type: dialog
    title: City name
    inputTitle: City
    saveTo: cityInput
  - id: geocode
    type: http
    url: "https://geocoding-api.open-meteo.com/v1/search?name={{cityInput.input}}&count=1"
    method: GET
    saveTo: geoResponse
  - id: parseGeo
    type: json
    source: geoResponse
    saveTo: geo
  - id: weather
    type: http
    url: "https://api.open-meteo.com/v1/forecast?latitude={{geo.results[0].latitude}}&longitude={{geo.results[0].longitude}}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto"
    method: GET
    saveTo: weatherData
  - id: parse
    type: json
    source: weatherData
    saveTo: data
  - id: report
    type: command
    prompt: "Create a weather report:\n{{data}}"
    saveTo: summary
  - id: save
    type: note
    path: "weather/{{cityInput.input}}.md"
    content: "# Weather: {{cityInput.input}}\n\n{{summary}}"
    mode: overwrite
```
````

### 6. Traducir Seleccion (con Hotkey)

````markdown
```workflow
name: Translate Selection
nodes:
  - id: getSelection
    type: prompt-selection
    saveTo: text
  - id: translate
    type: command
    prompt: "Translate the following text to English:\n\n{{text}}"
    saveTo: translated
  - id: output
    type: note
    path: "translations/translated.md"
    content: "## Original\n{{text}}\n\n## Translation\n{{translated}}\n\n---\n"
    mode: append
  - id: show
    type: open
    path: "translations/translated.md"
```
````

**Configuracion de hotkey:**
1. Agrega un campo `name:` a tu workflow
2. Abre el archivo de workflow y selecciona el workflow del menu desplegable
3. Haz clic en el icono de teclado en el pie del panel de Workflow
4. Ve a Configuracion, Atajos de teclado, busca "Workflow: Translate Selection"
5. Asigna un atajo de teclado (ej., `Ctrl+Shift+T`)

### 7. Composicion de Sub-Workflow

**Archivo: `workflows/translate.md`**
````markdown
```workflow
name: Translator
nodes:
  - id: translate
    type: command
    prompt: "Translate to {{targetLang}}:\n\n{{text}}"
    saveTo: translated
```
````

**Archivo: `workflows/main.md`**
````markdown
```workflow
name: Multi-Language Export
nodes:
  - id: input
    type: dialog
    title: Enter text to translate
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: toJapanese
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Japanese"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Spanish"}'
    output: '{"spanishText": "translated"}'
  - id: save
    type: note
    path: "translations/output.md"
    content: |
      # Original
      {{userInput.input}}

      ## Japanese
      {{japaneseText}}

      ## Spanish
      {{spanishText}}
    mode: overwrite
```
````

### 8. Seleccion Interactiva de Tareas

````markdown
```workflow
name: Task Processor
nodes:
  - id: selectTasks
    type: dialog
    title: Select Tasks
    message: Choose which tasks to perform on the current note
    options: "Summarize, Extract key points, Translate to English, Fix grammar"
    multiSelect: true
    button1: Process
    button2: Cancel
    saveTo: selection
  - id: checkCancel
    type: if
    condition: "{{selection.button}} == 'Cancel'"
    trueNext: cancelled
    falseNext: getFile
  - id: getFile
    type: prompt-file
    saveTo: content
  - id: process
    type: command
    prompt: |
      Perform the following tasks on this text:
      Tasks: {{selection.selected}}

      Text:
      {{content}}
    saveTo: result
  - id: save
    type: note
    path: "processed/result.md"
    content: "{{result}}"
    mode: create
    next: end
  - id: cancelled
    type: dialog
    title: Cancelled
    message: Operation was cancelled by user.
    button1: OK
    next: end
```
````
