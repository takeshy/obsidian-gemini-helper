# Gemini Helper para Obsidian

Asistente de IA **gratuito y de código abierto** para Obsidian con **Chat**, **Automatización de Flujos de Trabajo** y **RAG** impulsado por Google Gemini.

> **Este plugin es completamente gratuito.** Solo necesitas una clave API de Google Gemini (gratuita o de pago) de [ai.google.dev](https://ai.google.dev), o usar herramientas CLI: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code) o [Codex CLI](https://github.com/openai/codex).

## Características Principales

- **Chat con IA** - Respuestas en streaming, archivos adjuntos, operaciones en el vault, comandos slash
- **Constructor de Flujos de Trabajo** - Automatiza tareas de múltiples pasos con editor visual de nodos y 21 tipos de nodos
- **RAG** - Generación Aumentada por Recuperación para búsqueda inteligente en tu vault
- **Búsqueda Web** - Accede a información actualizada a través de Google Search
- **Generación de Imágenes** - Crea imágenes con los modelos de imagen de Gemini

## Opciones de Clave API / CLI

Este plugin requiere una clave API de Google Gemini o una herramienta CLI. Puedes elegir entre:

| Característica | Clave API Gratuita | Clave API de Pago | CLI |
|----------------|--------------------|--------------------|-----|
| Chat básico | ✅ | ✅ | ✅ |
| Operaciones en vault | ✅ | ✅ | Solo Lectura/Búsqueda |
| Búsqueda Web | ✅ | ✅ | ❌ |
| RAG | ✅ (limitado) | ✅ | ❌ |
| Flujos de trabajo | ✅ | ✅ | ✅ |
| Generación de imágenes | ❌ | ✅ | ❌ |
| Modelos | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| Costo | **Gratis** | Pago por uso | **Gratis** |

> [!TIP]
> ¡Las **Opciones CLI** te permiten usar modelos de última generación solo con una cuenta - sin necesidad de clave API!
> - **Gemini CLI**: Instala [Gemini CLI](https://github.com/google-gemini/gemini-cli), ejecuta `gemini` y autentícate con `/auth`
> - **Claude CLI**: Instala [Claude Code](https://github.com/anthropics/claude-code) (`npm install -g @anthropic-ai/claude-code`), ejecuta `claude` y autentícate
> - **Codex CLI**: Instala [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`), ejecuta `codex` y autentícate

### Consejos para la Clave API Gratuita

- Los **límites de frecuencia** son por modelo y se reinician diariamente. Cambia de modelo para continuar trabajando.
- La **sincronización RAG** es limitada. Ejecuta "Sync Vault" diariamente - los archivos ya subidos se omiten.
- Los **modelos Gemma** y **Gemini CLI** no soportan operaciones en el vault en Chat, pero **los Flujos de Trabajo aún pueden leer/escribir notas** usando los tipos de nodo `note`, `note-read` y otros. Las variables `{content}` y `{selection}` también funcionan.

---

# Chat con IA

La función de Chat con IA proporciona una interfaz de conversación interactiva con Google Gemini, integrada con tu vault de Obsidian.

![Interfaz de Chat](chat.png)

## Comandos Slash

Crea plantillas de prompts reutilizables activadas con `/`:

- Define plantillas con `{selection}` (texto seleccionado) y `{content}` (nota activa)
- Modelo opcional y anulación de búsqueda por comando
- Escribe `/` para ver los comandos disponibles

**Por defecto:** `/infographic` - Convierte contenido en infografía HTML

![Ejemplo de Infografía](chat_infographic.png)

## Menciones con @

Referencia archivos y variables escribiendo `@`:

- `{selection}` - Texto seleccionado
- `{content}` - Contenido de la nota activa
- Cualquier archivo del vault - Navega e inserta (solo ruta; la IA lee el contenido mediante herramientas)

> [!NOTE]
> Las menciones @ de archivos del vault insertan solo la ruta del archivo - la IA lee el contenido mediante herramientas. Esto no funciona con modelos Gemma (sin soporte de herramientas del vault). Gemini CLI puede leer archivos a través de shell, pero el formato de respuesta puede diferir.

## Archivos Adjuntos

Adjunta archivos directamente: Imágenes (PNG, JPEG, GIF, WebP), PDFs, Archivos de texto

## Llamada a Funciones (Operaciones en el Vault)

La IA puede interactuar con tu vault usando estas herramientas:

| Herramienta | Descripción |
|-------------|-------------|
| `read_note` | Leer contenido de nota |
| `create_note` | Crear nuevas notas |
| `propose_edit` | Editar con diálogo de confirmación |
| `propose_delete` | Eliminar con diálogo de confirmación |
| `bulk_propose_edit` | Edición masiva de múltiples archivos con diálogo de selección |
| `bulk_propose_delete` | Eliminación masiva de múltiples archivos con diálogo de selección |
| `search_notes` | Buscar en el vault por nombre o contenido |
| `list_notes` | Listar notas en carpeta |
| `rename_note` | Renombrar/mover notas |
| `create_folder` | Crear nuevas carpetas |
| `list_folders` | Listar carpetas en el vault |
| `get_active_note_info` | Obtener información sobre la nota activa |
| `get_rag_sync_status` | Verificar estado de sincronización RAG |

## Edición Segura

Cuando la IA usa `propose_edit`:
1. Un diálogo de confirmación muestra los cambios propuestos
2. Haz clic en **Apply** para escribir los cambios en el archivo
3. Haz clic en **Discard** para cancelar sin modificar el archivo

> Los cambios NO se escriben hasta que confirmes.

## RAG

Generación Aumentada por Recuperación para búsqueda inteligente en el vault:

- **Archivos soportados** - Markdown, PDF, Imágenes (PNG, JPEG, GIF, WebP)
- **Modo interno** - Sincroniza archivos del vault con Google File Search
- **Modo externo** - Usa IDs de almacenes existentes
- **Sincronización incremental** - Solo sube archivos modificados
- **Carpetas objetivo** - Especifica carpetas a incluir
- **Patrones de exclusión** - Patrones regex para excluir archivos

![Configuración RAG](setting_semantic_search.png)

---

# Constructor de Flujos de Trabajo

Construye flujos de trabajo automatizados de múltiples pasos directamente en archivos Markdown. **No se requiere conocimiento de programación** - simplemente describe lo que quieres en lenguaje natural, y la IA creará el flujo de trabajo por ti.

![Editor Visual de Flujos de Trabajo](visual_workflow.png)

## Creación de Flujos de Trabajo con IA

**No necesitas aprender sintaxis YAML ni tipos de nodos.** Simplemente describe tu flujo de trabajo en lenguaje natural:

1. Abre la pestaña **Workflow** en la barra lateral de Gemini
2. Selecciona **+ New (AI)** del menú desplegable
3. Describe lo que quieres: *"Crea un flujo de trabajo que resuma la nota seleccionada y la guarde en una carpeta de resúmenes"*
4. Haz clic en **Generate** - la IA crea el flujo de trabajo completo

![Crear Flujo de Trabajo con IA](create_workflow_with_ai.png)

**Modifica flujos de trabajo existentes de la misma manera:**
1. Carga cualquier flujo de trabajo
2. Haz clic en el botón **AI Modify**
3. Describe los cambios: *"Añade un paso para traducir el resumen al japonés"*
4. Revisa y aplica

![Modificación de Flujo de Trabajo con IA](modify_workflow_with_ai.png)

## Inicio Rápido (Manual)

También puedes escribir flujos de trabajo manualmente. Añade un bloque de código workflow a cualquier archivo Markdown:

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

Abre la pestaña **Workflow** en la barra lateral de Gemini para ejecutarlo.

## Tipos de Nodos Disponibles

Hay 21 tipos de nodos disponibles para construir flujos de trabajo:

| Categoría | Nodos |
|-----------|-------|
| Variables | `variable`, `set` |
| Control | `if`, `while` |
| LLM | `command` |
| Datos | `http`, `json` |
| Notas | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Archivos | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composición | `workflow` |
| RAG | `rag-sync` |
| Externos | `mcp` |

> **Para especificaciones detalladas de nodos y ejemplos, consulta [WORKFLOW_NODES_es.md](WORKFLOW_NODES_es.md)**

## Modo de Atajo de Teclado

Asigna atajos de teclado para ejecutar flujos de trabajo instantáneamente:

1. Añade un campo `name:` a tu flujo de trabajo
2. Abre el archivo del flujo de trabajo y selecciona el flujo del menú desplegable
3. Haz clic en el icono de teclado (⌨️) en el pie del panel de Workflow
4. Ve a Configuración → Teclas de acceso rápido → busca "Workflow: [Nombre de Tu Flujo de Trabajo]"
5. Asigna un atajo de teclado (ej., `Ctrl+Shift+T`)

Cuando se activa por atajo de teclado:
- `prompt-file` usa el archivo activo automáticamente (sin diálogo)
- `prompt-selection` usa la selección actual, o el contenido completo del archivo si no hay selección

## Disparadores de Eventos

Los flujos de trabajo pueden activarse automáticamente por eventos de Obsidian:

![Configuración de Disparadores de Eventos](event_setting.png)

| Evento | Descripción |
|--------|-------------|
| File Created | Se activa cuando se crea un nuevo archivo |
| File Modified | Se activa cuando se guarda un archivo (con debounce de 5s) |
| File Deleted | Se activa cuando se elimina un archivo |
| File Renamed | Se activa cuando se renombra un archivo |
| File Opened | Se activa cuando se abre un archivo |

**Configuración de disparadores de eventos:**
1. Añade un campo `name:` a tu flujo de trabajo
2. Abre el archivo del flujo de trabajo y selecciona el flujo del menú desplegable
3. Haz clic en el icono de rayo (⚡) en el pie del panel de Workflow
4. Selecciona qué eventos deben activar el flujo de trabajo
5. Opcionalmente añade un filtro de patrón de archivo

**Ejemplos de patrones de archivo:**
- `**/*.md` - Todos los archivos Markdown en cualquier carpeta
- `journal/*.md` - Archivos Markdown solo en la carpeta journal
- `*.md` - Archivos Markdown solo en la carpeta raíz
- `**/{daily,weekly}/*.md` - Archivos en carpetas daily o weekly
- `projects/[a-z]*.md` - Archivos que empiezan con letra minúscula

**Variables de evento:** Cuando se activa por un evento, estas variables se establecen automáticamente:

| Variable | Descripción |
|----------|-------------|
| `__eventType__` | Tipo de evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Ruta del archivo afectado |
| `__eventFile__` | JSON con información del archivo (path, basename, name, extension) |
| `__eventFileContent__` | Contenido del archivo (para eventos create/modify/file-open) |
| `__eventOldPath__` | Ruta anterior (solo para eventos rename) |

> **Nota:** Los nodos `prompt-file` y `prompt-selection` usan automáticamente el archivo del evento cuando se activan por eventos. `prompt-selection` usa el contenido completo del archivo como la selección.

---

# Común

## Modelos Soportados

### Plan de Pago
| Modelo | Descripción |
|--------|-------------|
| Gemini 3 Flash Preview | Modelo rápido, contexto de 1M (predeterminado) |
| Gemini 3 Pro Preview | Modelo insignia, contexto de 1M |
| Gemini 2.5 Flash Lite | Modelo flash ligero |
| Gemini 2.5 Flash (Image) | Generación de imágenes, 1024px |
| Gemini 3 Pro (Image) | Generación de imágenes Pro, 4K |

### Plan Gratuito
| Modelo | Operaciones en Vault |
|--------|----------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Instalación

### BRAT (Recomendado)
1. Instala el plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Abre configuración de BRAT → "Add Beta plugin"
3. Ingresa: `https://github.com/takeshy/obsidian-gemini-helper`
4. Habilita el plugin en la configuración de Community plugins

### Manual
1. Descarga `main.js`, `manifest.json`, `styles.css` de releases
2. Crea la carpeta `gemini-helper` en `.obsidian/plugins/`
3. Copia los archivos y habilita en la configuración de Obsidian

### Desde el Código Fuente
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configuración

### Configuración de API
1. Obtén la clave API de [ai.google.dev](https://ai.google.dev)
2. Ingrésala en la configuración del plugin
3. Selecciona el plan de API (Gratuito/De Pago)

![Configuración Básica](setting_basic.png)

### Modo CLI (Gemini / Claude / Codex)

**Gemini CLI:**
1. Instala [Gemini CLI](https://github.com/google-gemini/gemini-cli)
2. Autentícate con `gemini` → `/auth`
3. Haz clic en "Verify" en la sección Gemini CLI

**Claude CLI:**
1. Instala [Claude Code](https://github.com/anthropics/claude-code): `npm install -g @anthropic-ai/claude-code`
2. Autentícate con `claude`
3. Haz clic en "Verify" en la sección Claude CLI

**Codex CLI:**
1. Instala [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
2. Autentícate con `codex`
3. Haz clic en "Verify" en la sección Codex CLI

**Limitaciones de CLI:** Operaciones de vault solo lectura, sin búsqueda semántica/web

### Configuración del Espacio de Trabajo
- **Workspace Folder** - Ubicación del historial de chat y configuración
- **System Prompt** - Instrucciones adicionales para la IA
- **Tool Limits** - Controla los límites de llamadas a funciones
- **Slash Commands** - Define plantillas de prompts personalizadas

![Límite de Herramientas y Comandos Slash](setting_tool_limit_slash_command.png)

## Uso

### Abrir el Chat
- Haz clic en el icono de Gemini en la barra lateral
- Comando: "Gemini Helper: Open chat"
- Alternar: "Gemini Helper: Toggle chat / editor"

### Controles del Chat
- **Enter** - Enviar mensaje
- **Shift+Enter** - Nueva línea
- **Botón Stop** - Detener generación
- **Botón +** - Nuevo chat
- **Botón History** - Cargar chats anteriores

### Usando Flujos de Trabajo
1. Abre la pestaña **Workflow** en la barra lateral
2. Abre un archivo con bloque de código `workflow`
3. Selecciona el flujo de trabajo del menú desplegable
4. Haz clic en **Run** para ejecutar
5. Haz clic en **History** para ver ejecuciones anteriores

![Historial de Flujos de Trabajo](workflow_history.png)

**Exportar a Canvas:** Visualiza el historial de ejecución como un Canvas de Obsidian para análisis visual.

![Vista de Canvas del Historial](history_canvas.png)

### Generación de Flujos de Trabajo con IA

**Crear Nuevo Flujo de Trabajo con IA:**
1. Selecciona **+ New (AI)** del menú desplegable de workflow
2. Ingresa el nombre del flujo de trabajo y la ruta de salida (soporta la variable `{{name}}`)
3. Describe lo que el flujo de trabajo debe hacer en lenguaje natural
4. Selecciona un modelo y haz clic en **Generate**
5. El flujo de trabajo se crea y guarda automáticamente

**Modificar Flujo de Trabajo Existente con IA:**
1. Carga un flujo de trabajo existente
2. Haz clic en el botón **AI Modify** (icono de destello)
3. Describe los cambios que deseas
4. Revisa la comparación antes/después
5. Haz clic en **Apply Changes** para actualizar

![Modificación de Flujo de Trabajo con IA](modify_workflow_with_ai.png)

**Edición Manual de Flujos de Trabajo:**

Edita flujos de trabajo directamente en el editor visual de nodos con interfaz de arrastrar y soltar.

![Edición Manual de Flujos de Trabajo](modify_workflow_manual.png)

**Recargar desde Archivo:**
- Selecciona **Reload from file** del menú desplegable para re-importar el flujo de trabajo desde el archivo markdown

## Requisitos

- Obsidian v0.15.0+
- Clave API de Google AI, o herramienta CLI (Gemini CLI / Claude CLI / Codex CLI)
- Soporte para escritorio y móvil (modo CLI: solo escritorio)

## Privacidad

**Datos almacenados localmente:**
- Clave API (almacenada en la configuración de Obsidian)
- Historial de chat (como archivos Markdown)
- Historial de ejecución de flujos de trabajo

**Datos enviados a Google:**
- Todos los mensajes de chat y archivos adjuntos se envían a la API de Google Gemini para procesamiento
- Cuando RAG está habilitado, los archivos del vault se suben a Google File Search
- Cuando la Búsqueda Web está habilitada, las consultas se envían a Google Search

**Datos enviados a servicios de terceros:**
- Los nodos `http` de flujos de trabajo pueden enviar datos a cualquier URL especificada en el flujo de trabajo

**Proveedores CLI (opcional):**
- Cuando el modo CLI está habilitado, se ejecutan herramientas CLI externas (gemini, claude, codex) a través de child_process
- Esto solo ocurre cuando está explícitamente configurado y verificado por el usuario
- El modo CLI es solo para escritorio (no disponible en móvil)

**Notas de seguridad:**
- Revisa los flujos de trabajo antes de ejecutarlos - los nodos `http` pueden transmitir datos del vault a endpoints externos
- Los nodos `note` de flujos de trabajo muestran un diálogo de confirmación antes de escribir archivos (comportamiento predeterminado)
- Los comandos slash con `confirmEdits: false` aplicarán automáticamente las ediciones de archivos sin mostrar botones Apply/Discard

Consulta los [Términos de Servicio de Google AI](https://ai.google.dev/terms) para políticas de retención de datos.

## Licencia

MIT

## Enlaces

- [Documentación de la API de Gemini](https://ai.google.dev/docs)
- [Documentación de Plugins de Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Apoyo

Si encuentras útil este plugin, ¡considera invitarme un café!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
