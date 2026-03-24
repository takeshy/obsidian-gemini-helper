# Gemini Helper para Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

Asistente de IA **gratuito y de codigo abierto** para Obsidian con **Chat**, **Automatizacion de Flujos de Trabajo** y **RAG** impulsado por Google Gemini.

> **Desde v1.11.0, este plugin se enfoca exclusivamente en funciones relacionadas con Gemini.**
> Se ha eliminado el soporte de CLI. Se ha creado un nuevo plugin [obsidian-llm-hub](https://github.com/takeshy/obsidian-llm-hub) con soporte de CLI y multiples proveedores de LLM (OpenAI, Claude, OpenRouter, Local LLM).
> La integracion con GemiHub (Google Drive) se ha separado en [obsidian-gemihub](https://github.com/takeshy/obsidian-gemihub).

### Plugins Relacionados

| Plugin | Descripcion |
|--------|-------------|
| obsidian-gemini-helper | Enfocado en Gemini (RAG via File Search API) |
| obsidian-llm-hub | Soporte multi-LLM, solo Desktop (RAG via Embedding, compatible con gemini-embedding-2-preview) |
| obsidian-local-llm-hub | Solo LLM local (RAG solo via embeddings locales) |
| obsidian-gemihub | Sincronizacion de archivos con GemiHub (version web de gemini-helper) via Google Drive |

---

> **Este plugin es completamente gratuito.** Solo necesitas una clave API de Google Gemini (gratuita o de pago) de [ai.google.dev](https://ai.google.dev).

## Caracteristicas Principales

- **Chat con IA** - Respuestas en streaming, archivos adjuntos, operaciones en el vault, comandos slash
- **Constructor de Flujos de Trabajo** - Automatiza tareas de multiples pasos con editor visual de nodos y 24 tipos de nodos
- **Historial de Edicion** - Rastrea y restaura cambios hechos por IA con vista de diferencias
- **RAG** - Generacion Aumentada por Recuperacion para busqueda inteligente en tu vault
- **Busqueda Web** - Accede a informacion actualizada a traves de Google Search
- **Generacion de Imagenes** - Crea imagenes con los modelos de imagen de Gemini
- **Cifrado** - Protege con contrasena el historial de chat y los registros de ejecucion de workflows

![Generacion de imagenes en el chat](docs/images/chat_image.png)

## Clave API

Este plugin requiere una clave API de Google Gemini. Puedes elegir entre:

| Caracteristica | Clave API Gratuita | Clave API de Pago |
|----------------|--------------------|--------------------|
| Chat basico | ✅ | ✅ |
| Operaciones en vault | ✅ | ✅ |
| Busqueda Web | ✅ | ✅ |
| RAG | ✅ (limitado) | ✅ |
| Flujos de trabajo | ✅ | ✅ |
| Generacion de imagenes | ❌ | ✅ |
| Modelos | Flash, Gemma | Flash, Pro, Image |
| Costo | **Gratis** | Pago por uso |

### Consejos para la Clave API Gratuita

- Los **limites de frecuencia** son por modelo y se reinician diariamente. Cambia de modelo para continuar trabajando.
- La **sincronizacion RAG** es limitada. Ejecuta "Sync Vault" diariamente - los archivos ya subidos se omiten.
- Los **modelos Gemma** no soportan operaciones en el vault en Chat, pero **los Flujos de Trabajo aun pueden leer/escribir notas** usando los tipos de nodo `note`, `note-read` y otros. Las variables `{content}` y `{selection}` tambien funcionan.

---

# Chat con IA

La funcion de Chat con IA proporciona una interfaz de conversacion interactiva con Google Gemini, integrada con tu vault de Obsidian.

![Interfaz de Chat](docs/images/chat.png)

## Abrir el Chat
- Haz clic en el icono de Gemini en la barra lateral
- Comando: "Gemini Helper: Open chat"
- Alternar: "Gemini Helper: Toggle chat / editor"

## Controles del Chat
- **Enter** - Enviar mensaje
- **Shift+Enter** - Nueva linea
- **Boton Stop** - Detener generacion
- **Boton +** - Nuevo chat
- **Boton History** - Cargar chats anteriores

## Comandos Slash

Crea plantillas de prompts reutilizables activadas con `/`:

- Define plantillas con `{selection}` (texto seleccionado) y `{content}` (nota activa)
- Modelo opcional y anulacion de busqueda por comando
- Escribe `/` para ver los comandos disponibles

**Por defecto:** `/infographic` - Convierte contenido en infografia HTML

![Ejemplo de Infografia](docs/images/chat_infographic.png)

## Menciones con @

Referencia archivos y variables escribiendo `@`:

- `{selection}` - Texto seleccionado
- `{content}` - Contenido de la nota activa
- Cualquier archivo del vault - Navega e inserta (solo ruta; la IA lee el contenido mediante herramientas)

> [!NOTE]
> **Como funcionan `{selection}` y `{content}`:** Cuando cambias de la Vista Markdown a la Vista de Chat, la seleccion normalmente se borraria debido al cambio de foco. Para preservar tu seleccion, el plugin la captura al cambiar de vista y resalta el area seleccionada con un color de fondo en la Vista Markdown. La opcion `{selection}` solo aparece en las sugerencias de @ cuando hay texto seleccionado.
>
> Tanto `{selection}` como `{content}` **no se expanden** intencionalmente en el area de entrada--dado que la entrada del chat es compacta, expandir texto largo dificultaria la escritura. El contenido se expande cuando envias el mensaje, lo cual puedes verificar revisando tu mensaje enviado en el chat.

> [!NOTE]
> Las menciones @ de archivos del vault insertan solo la ruta del archivo - la IA lee el contenido mediante herramientas. Esto no funciona con modelos Gemma (sin soporte de herramientas del vault).

## Archivos Adjuntos

Adjunta archivos directamente: Imagenes (PNG, JPEG, GIF, WebP), PDFs, Archivos de texto, Audio (MP3, WAV, FLAC, AAC, Opus, OGG), Video (MP4, WebM, MOV, AVI, MKV)

## Llamada a Funciones (Operaciones en el Vault)

La IA puede interactuar con tu vault usando estas herramientas:

| Herramienta | Descripcion |
|-------------|-------------|
| `read_note` | Leer contenido de nota |
| `create_note` | Crear nuevas notas |
| `propose_edit` | Editar con dialogo de confirmacion |
| `propose_delete` | Eliminar con dialogo de confirmacion |
| `bulk_propose_edit` | Edicion masiva de multiples archivos con dialogo de seleccion |
| `bulk_propose_delete` | Eliminacion masiva de multiples archivos con dialogo de seleccion |
| `search_notes` | Buscar en el vault por nombre o contenido |
| `list_notes` | Listar notas en carpeta |
| `rename_note` | Renombrar/mover notas |
| `create_folder` | Crear nuevas carpetas |
| `list_folders` | Listar carpetas en el vault |
| `get_active_note_info` | Obtener informacion sobre la nota activa |
| `get_rag_sync_status` | Verificar estado de sincronizacion RAG |
| `bulk_propose_rename` | Renombrar multiples archivos en lote con dialogo de seleccion |

### Modo de Herramientas del Vault

Cuando la IA maneja notas en el Chat, usa herramientas del Vault. Controla que herramientas del vault puede usar la IA mediante el icono de base de datos (📦) debajo del boton de adjuntos:

| Modo | Descripcion | Herramientas Disponibles |
|------|-------------|--------------------------|
| **Vault: Todo** | Acceso completo al vault | Todas las herramientas |
| **Vault: Sin busqueda** | Excluir herramientas de busqueda | Todas excepto `search_notes`, `list_notes` |
| **Vault: Desactivado** | Sin acceso al vault | Ninguna |

**Cuando usar cada modo:**

- **Vault: Todo** - Modo predeterminado para uso general. La IA puede leer, escribir y buscar en tu vault.
- **Vault: Sin busqueda** - Usalo cuando quieras buscar solo con RAG, o cuando ya conoces el archivo objetivo. Esto evita busquedas redundantes en el vault, ahorrando tokens y mejorando el tiempo de respuesta.
- **Vault: Desactivado** - Usalo cuando no necesitas acceso al vault en absoluto.

**Seleccion automatica de modo:**

| Condicion | Modo Predeterminado | Modificable |
|-----------|---------------------|-------------|
| Modelos Gemma | Vault: Desactivado | No |
| Web Search habilitado | Vault: Desactivado | No |
| RAG habilitado | Vault: Desactivado | No |
| Sin RAG | Vault: Todo | Si |

**Por que algunos modos son forzados:**

- **Modelos Gemma**: Estos modelos no soportan llamadas a funciones, por lo que las herramientas del Vault no se pueden usar.
- **Web Search**: Por diseno, las herramientas del Vault estan deshabilitadas cuando Web Search esta habilitado.
- **RAG habilitado**: La API de Gemini no soporta combinar File Search (RAG) con llamadas a funciones. Cuando el RAG esta habilitado, las herramientas del Vault y MCP se deshabilitan automaticamente.

## Edicion Segura

Cuando la IA usa `propose_edit`:
1. Un dialogo de confirmacion muestra los cambios propuestos
2. Haz clic en **Apply** para escribir los cambios en el archivo
3. Haz clic en **Discard** para cancelar sin modificar el archivo

> Los cambios NO se escriben hasta que confirmes.

## Historial de Edicion

Rastrea y restaura cambios hechos a tus notas:

- **Seguimiento automatico** - Todas las ediciones de IA (chat, flujo de trabajo) y cambios manuales se registran
- **Acceso desde menu de archivo** - Clic derecho en un archivo markdown para acceder a:
  - **Snapshot** - Guardar el estado actual como instantanea
  - **History** - Abrir el modal de historial de edicion

![Menu de Archivo](docs/images/snap_history.png)

- **Paleta de comandos** - Tambien disponible via comando "Show edit history"
- **Vista de diferencias** - Ve exactamente que cambio con adiciones/eliminaciones codificadas por color
- **Restaurar** - Revierte a cualquier version anterior con un clic
- **Copiar** - Guarda una version historica como un nuevo archivo (nombre predeterminado: `{filename}_{datetime}.md`)
- **Modal redimensionable** - Arrastra para mover, redimensiona desde las esquinas

**Visualizacion de diferencias:**
- Las lineas `+` existian en la version anterior
- Las lineas `-` fueron anadidas en la version mas nueva

**Como funciona:**

El historial de edicion usa un enfoque basado en instantaneas:

1. **Creacion de instantanea** - Cuando un archivo se abre por primera vez o es modificado por IA, se guarda una instantanea de su contenido
2. **Registro de diferencias** - Cuando el archivo se modifica, la diferencia entre el nuevo contenido y la instantanea se registra como una entrada de historial
3. **Actualizacion de instantanea** - La instantanea se actualiza al nuevo contenido despues de cada modificacion
4. **Restaurar** - Para restaurar a una version anterior, las diferencias se aplican en reversa desde la instantanea

**Cuando se registra el historial:**
- Ediciones de chat IA (herramienta `propose_edit`)
- Modificaciones de notas en flujos de trabajo (nodo `note`)
- Guardados manuales via comando
- Auto-deteccion cuando el archivo difiere de la instantanea al abrir

**Almacenamiento:** El historial de edicion se almacena en memoria y se borra al reiniciar Obsidian. El seguimiento persistente de versiones esta cubierto por la recuperacion de archivos integrada de Obsidian.

![Modal de Historial de Edicion](docs/images/edit_history.png)

## RAG

Generacion Aumentada por Recuperacion para busqueda inteligente en el vault:

- **Archivos soportados** - Markdown, PDF, Documentos de Office (Doc, Docx, XLS, XLSX, PPTX)
- **Modo interno** - Sincroniza archivos del vault con Google File Search
- **Modo externo** - Usa IDs de almacenes existentes
- **Sincronizacion incremental** - Solo sube archivos modificados
- **Carpetas objetivo** - Especifica carpetas a incluir
- **Patrones de exclusion** - Patrones regex para excluir archivos

![Configuracion RAG](docs/images/setting_rag.png)

## Servidores MCP

Los servidores MCP (Model Context Protocol) proporcionan herramientas adicionales que extienden las capacidades de la IA mas alla de las operaciones del vault.

**Configuracion:**

1. Abre la configuracion del plugin -> seccion **Servidores MCP**
2. Haz clic en **Agregar servidor**
3. Ingresa el nombre y URL del servidor
4. Configura encabezados opcionales (formato JSON) para autenticacion
5. Haz clic en **Probar conexion** para verificar y obtener las herramientas disponibles
6. Guarda la configuracion del servidor

> **Nota:** La prueba de conexion es obligatoria antes de guardar. Esto asegura que el servidor sea accesible y muestra las herramientas disponibles.

![Configuracion de Servidores MCP](docs/images/setting_mcp.png)

**Uso de herramientas MCP:**

- **En el chat:** Haz clic en el icono de base de datos (📦) para abrir la configuracion de herramientas. Habilita/deshabilita servidores MCP por conversacion.
- **En flujos de trabajo:** Usa el nodo `mcp` para llamar herramientas del servidor MCP.

**Sugerencias de herramientas:** Despues de una prueba de conexion exitosa, los nombres de las herramientas disponibles se guardan y se muestran tanto en la configuracion como en la interfaz del chat.

### MCP Apps (UI Interactiva)

Algunas herramientas MCP devuelven UI interactiva que te permite interactuar visualmente con los resultados de la herramienta. Esta funcion se basa en la [especificacion MCP Apps](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps).

![MCP Apps](docs/images/mcp_apps.png)

**Como funciona:**

- Cuando una herramienta MCP devuelve un URI de recurso `ui://` en los metadatos de su respuesta, el plugin obtiene y renderiza el contenido HTML
- La UI se muestra en un iframe aislado por seguridad (`sandbox="allow-scripts allow-forms"`)
- Las aplicaciones interactivas pueden llamar a herramientas MCP adicionales y actualizar el contexto a traves de un puente JSON-RPC

**En el Chat:**
- MCP Apps aparece en linea en los mensajes del asistente con un boton para expandir/colapsar
- Haz clic en ⊕ para expandir a pantalla completa, ⊖ para colapsar

**En Flujos de Trabajo:**
- MCP Apps se muestra en un dialogo modal durante la ejecucion del flujo de trabajo
- El flujo de trabajo se pausa para permitir la interaccion del usuario, luego continua cuando se cierra el modal

> **Seguridad:** Todo el contenido de MCP App se ejecuta en un iframe aislado con permisos restringidos. El iframe no puede acceder al DOM, cookies o almacenamiento local de la pagina principal. Solo estan habilitados `allow-scripts` y `allow-forms`.

## Skills de Agente

Extienda las capacidades de la IA con instrucciones personalizadas, materiales de referencia y flujos de trabajo ejecutables. Los skills siguen el patron estandar de la industria para skills de agente (p. ej., [OpenAI Codex](https://github.com/openai/codex) `.codex/skills/`).

- **Instrucciones personalizadas** - Defina comportamiento especifico del dominio mediante archivos `SKILL.md`
- **Materiales de referencia** - Incluya guias de estilo, plantillas y listas de verificacion en `references/`
- **Integracion con flujos de trabajo** - Los skills pueden exponer flujos de trabajo como herramientas de Function Calling
- **Comando slash** - Escriba `/folder-name` para invocar un skill al instante y enviar
- **Activacion selectiva** - Elija que skills estan activos por conversacion

Cree skills de la misma manera que los workflows -- seleccione **+ New (AI)**, marque **"Crear como agent skill"** y describa lo que desea. La AI genera tanto las instrucciones del `SKILL.md` como el workflow.

> **Para instrucciones de configuracion y ejemplos, consulte [SKILLS.md](docs/SKILLS_es.md)**

---

# Constructor de Flujos de Trabajo

Construye flujos de trabajo automatizados de multiples pasos directamente en archivos Markdown. **No se requiere conocimiento de programacion** - simplemente describe lo que quieres en lenguaje natural, y la IA creara el flujo de trabajo por ti.

![Editor Visual de Flujos de Trabajo](docs/images/visual_workflow.png)

## Ejecucion de Flujos de Trabajo

**Desde la Barra Lateral:**
1. Abre la pestana **Workflow** en la barra lateral
2. Abre un archivo con bloque de codigo `workflow`
3. Selecciona el flujo de trabajo del menu desplegable (o elige **Browse all workflows** para buscar todos los flujos de trabajo del vault)
4. Haz clic en **Run** para ejecutar
5. Haz clic en **History** para ver ejecuciones anteriores

**Desde la Paleta de Comandos (Run Workflow):**

Usa el comando "Gemini Helper: Run Workflow" para navegar y ejecutar flujos de trabajo desde cualquier lugar:

1. Abre la paleta de comandos y busca "Run Workflow"
2. Navega por todos los archivos del vault con bloques de codigo workflow (los archivos en la carpeta `workflows/` se muestran primero)
3. Previsualiza el contenido del workflow y el historial de generacion con IA
4. Selecciona un workflow y haz clic en **Run** para ejecutar

![Modal de Ejecutar Workflow](docs/images/workflow_list.png)

Esto es util para ejecutar rapidamente flujos de trabajo sin tener que navegar primero al archivo del workflow.

![Historial de Flujos de Trabajo](docs/images/workflow_history.png)

**Exportar historial de ejecucion:** Visualiza el historial de ejecucion como un Canvas de Obsidian para analisis visual. Haz clic en **Open Canvas view** en el modal de Historial para crear un archivo Canvas.

> **Nota:** Los archivos Canvas se crean dinamicamente en la carpeta del workspace. Eliminalos manualmente despues de revisarlos si ya no los necesitas.

![Vista de Canvas del Historial](docs/images/history_canvas.png)

## Creacion de Workflows y Skills con AI

**No necesitas aprender sintaxis YAML ni tipos de nodos.** Simplemente describe tu flujo de trabajo en lenguaje natural:

1. Abre la pestana **Workflow** en la barra lateral de Gemini
2. Selecciona **+ New (AI)** del menu desplegable
3. Describe lo que quieres: *"Crea un flujo de trabajo que resuma la nota seleccionada y la guarde en una carpeta de resumenes"*
4. Marque **"Crear como agent skill"** si desea crear un agent skill en lugar de un workflow independiente
5. Selecciona un modelo y haz clic en **Generate**
6. El flujo de trabajo se crea y guarda automaticamente
> **Consejo:** Al usar **+ New (AI)** desde el menu desplegable en un archivo que ya tiene flujos de trabajo, la ruta de salida se establece por defecto al archivo actual. El flujo de trabajo generado se anadira a ese archivo.

**Crear flujo de trabajo desde cualquier archivo:**

Al abrir la pestana Workflow con un archivo que no tiene bloque de codigo workflow, se muestra un boton **"Create workflow with AI"**. Haz clic para generar un nuevo flujo de trabajo (salida predeterminada: `workflows/{{name}}.md`).

**Referencias de Archivos con @:**

Escribe `@` en el campo de descripcion para referenciar archivos:
- `@{selection}` - Seleccion actual del editor
- `@{content}` - Contenido de la nota activa
- `@path/to/file.md` - Cualquier archivo del vault

Cuando haces clic en Generate, el contenido del archivo se incrusta directamente en la solicitud de IA. El frontmatter YAML se elimina automaticamente.

> **Consejo:** Esto es util para crear flujos de trabajo basados en ejemplos o plantillas de workflow existentes en tu vault.

**Archivos Adjuntos:**

Haz clic en el boton de adjuntos para adjuntar archivos (imagenes, PDFs, archivos de texto) a tu solicitud de generacion de flujo de trabajo. Esto es util para proporcionar contexto visual o ejemplos a la IA.

**Usar LLMs Externos (Copiar Prompt / Pegar Respuesta):**

Puedes usar cualquier LLM externo (Claude, GPT, etc.) para generar flujos de trabajo:

1. Completa el nombre y la descripcion del flujo de trabajo como siempre
2. Haz clic en **Copy Prompt** - el prompt completo se copia al portapapeles
3. Pega el prompt en tu LLM preferido
4. Copia la respuesta del LLM
5. Pegala en el area de texto **Pegar Respuesta** que aparece
6. Haz clic en **Aplicar** para crear el flujo de trabajo

La respuesta pegada puede ser YAML puro o un documento Markdown completo con bloques de codigo `` ```workflow ``. Las respuestas en Markdown se guardan tal cual, preservando cualquier documentacion incluida por el LLM.

![Crear Flujo de Trabajo con IA](docs/images/create_workflow.png)

**Controles del Modal:**

El modal de flujo de trabajo con IA soporta posicionamiento con arrastrar y soltar y redimensionamiento desde las esquinas para una mejor experiencia de edicion.

**Historial de Solicitudes:**

Cada flujo de trabajo generado por IA guarda una entrada de historial sobre el bloque de codigo del workflow, incluyendo:
- Marca de tiempo y accion (Creado/Modificado)
- Tu descripcion de la solicitud
- Contenidos de archivos referenciados (en secciones colapsables)
**Modificar flujos de trabajo existentes de la misma manera:**
1. Carga cualquier flujo de trabajo
2. Haz clic en el boton **AI Modify** (icono de destello)
3. Describe los cambios: *"Anade un paso para traducir el resumen al japones"*
4. Revisa la comparacion antes/despues
5. Haz clic en **Apply Changes** para actualizar

**Referencia del Historial de Ejecucion:**

Al modificar un flujo de trabajo con IA, puedes hacer referencia a resultados de ejecuciones anteriores para ayudar a la IA a entender los problemas:

1. Haz clic en el boton **Referenciar historial de ejecucion**
2. Selecciona una ejecucion de la lista (las ejecuciones con errores estan resaltadas)
3. Elige que pasos incluir (los pasos con errores estan preseleccionados)
4. La IA recibe los datos de entrada/salida del paso para entender que salio mal

Esto es especialmente util para depurar flujos de trabajo - puedes decirle a la IA "Corrige el error en el paso 2" y vera exactamente que entrada causo la falla.

**Historial de Solicitudes:**

Al regenerar un flujo de trabajo (haciendo clic en "No" en la vista previa), todas las solicitudes anteriores de la sesion se pasan a la IA. Esto ayuda a la IA a entender el contexto completo de tus modificaciones a traves de multiples iteraciones.

**Edicion Manual de Flujos de Trabajo:**

Edita flujos de trabajo directamente en el editor visual de nodos con interfaz de arrastrar y soltar.

![Edicion Manual de Flujos de Trabajo](docs/images/modify_workflow_manual.png)

**Recargar desde Archivo:**
- Selecciona **Reload from file** del menu desplegable para re-importar el flujo de trabajo desde el archivo markdown

## Inicio Rapido (Manual)

Tambien puedes escribir flujos de trabajo manualmente. Anade un bloque de codigo workflow a cualquier archivo Markdown:

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

Abre la pestana **Workflow** en la barra lateral de Gemini para ejecutarlo.

## Tipos de Nodos Disponibles

Hay 24 tipos de nodos disponibles para construir flujos de trabajo:

| Categoria | Nodos |
|-----------|-------|
| Variables | `variable`, `set` |
| Control | `if`, `while` |
| LLM | `command` |
| Datos | `http`, `json`, `script` |
| Notas | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Archivos | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composicion | `workflow` |
| RAG | `rag-sync` |
| Externos | `mcp`, `obsidian-command` |
| Utilidad | `sleep` |

> **Para especificaciones detalladas de nodos y ejemplos, consulta [WORKFLOW_NODES_es.md](docs/WORKFLOW_NODES_es.md)**

## Modo de Atajo de Teclado

Asigna atajos de teclado para ejecutar flujos de trabajo instantaneamente:

1. Anade un campo `name:` a tu flujo de trabajo
2. Abre el archivo del flujo de trabajo y selecciona el flujo del menu desplegable
3. Haz clic en el icono de teclado (⌨️) en el pie del panel de Workflow
4. Ve a Configuracion -> Teclas de acceso rapido -> busca "Workflow: [Nombre de Tu Flujo de Trabajo]"
5. Asigna un atajo de teclado (ej., `Ctrl+Shift+T`)

Cuando se activa por atajo de teclado:
- `prompt-file` usa el archivo activo automaticamente (sin dialogo)
- `prompt-selection` usa la seleccion actual, o el contenido completo del archivo si no hay seleccion

## Disparadores de Eventos

Los flujos de trabajo pueden activarse automaticamente por eventos de Obsidian:

![Configuracion de Disparadores de Eventos](docs/images/event_setting.png)

| Evento | Descripcion |
|--------|-------------|
| File Created | Se activa cuando se crea un nuevo archivo |
| File Modified | Se activa cuando se guarda un archivo (con debounce de 5s) |
| File Deleted | Se activa cuando se elimina un archivo |
| File Renamed | Se activa cuando se renombra un archivo |
| File Opened | Se activa cuando se abre un archivo |

**Configuracion de disparadores de eventos:**
1. Anade un campo `name:` a tu flujo de trabajo
2. Abre el archivo del flujo de trabajo y selecciona el flujo del menu desplegable
3. Haz clic en el icono de rayo (⚡) en el pie del panel de Workflow
4. Selecciona que eventos deben activar el flujo de trabajo
5. Opcionalmente anade un filtro de patron de archivo

**Ejemplos de patrones de archivo:**
- `**/*.md` - Todos los archivos Markdown en cualquier carpeta
- `journal/*.md` - Archivos Markdown solo en la carpeta journal
- `*.md` - Archivos Markdown solo en la carpeta raiz
- `**/{daily,weekly}/*.md` - Archivos en carpetas daily o weekly
- `projects/[a-z]*.md` - Archivos que empiezan con letra minuscula

**Variables de evento:** Cuando se activa por un evento, estas variables se establecen automaticamente:

| Variable | Descripcion |
|----------|-------------|
| `_eventType` | Tipo de evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `_eventFilePath` | Ruta del archivo afectado |
| `_eventFile` | JSON con informacion del archivo (path, basename, name, extension) |
| `_eventFileContent` | Contenido del archivo (para eventos create/modify/file-open) |
| `_eventOldPath` | Ruta anterior (solo para eventos rename) |

> **Nota:** Los nodos `prompt-file` y `prompt-selection` usan automaticamente el archivo del evento cuando se activan por eventos. `prompt-selection` usa el contenido completo del archivo como la seleccion.

---

# Comun

## Modelos Soportados

### Plan de Pago
| Modelo | Descripcion |
|--------|-------------|
| Gemini 3.1 Pro Preview | Ultimo modelo insignia, contexto 1M (recomendado) |
| Gemini 3.1 Pro Preview (Custom Tools) | Optimizado para flujos de trabajo agenticos con herramientas personalizadas y bash |
| Gemini 3 Flash Preview | Modelo rapido, contexto 1M, mejor relacion costo-rendimiento |
| Gemini 3.1 Flash Lite Preview | Modelo mas rentable con alto rendimiento |
| Gemini 2.5 Flash | Modelo rapido, contexto 1M |
| Gemini 2.5 Pro | Modelo Pro, contexto 1M |
| Gemini 3 Pro (Image) | Generacion de imagenes Pro, 4K |
| Gemini 3.1 Flash (Image) | Generacion de imagenes rapida y economica |

> **Modo Thinking:** En el chat, el modo thinking se activa con palabras clave como "piensa", "analiza" o "reflexiona" en tu mensaje. Sin embargo, **Gemini 3.1 Pro** siempre usa el modo thinking independientemente de las palabras clave -- este modelo no permite desactivar thinking.

**Toggle Always Think:**

Puedes forzar el modo thinking a ACTIVADO para los modelos Flash sin usar palabras clave. Haz clic en el icono de base de datos (📦) para abrir el menu de herramientas, y marca los toggles bajo **Always Think**:

- **Flash** -- DESACTIVADO por defecto. Marca para activar siempre el thinking para los modelos Flash.
- **Flash Lite** -- ACTIVADO por defecto. Flash Lite tiene una diferencia minima de coste y velocidad con el thinking activado, por lo que se recomienda mantenerlo activado.

Cuando un toggle esta ACTIVADO, el thinking siempre esta activo para esa familia de modelos independientemente del contenido del mensaje. Cuando esta DESACTIVADO, se usa la deteccion basada en palabras clave existente.

![Always Think Settings](docs/images/setting_thinking.png)

### Plan Gratuito
| Modelo | Operaciones en Vault |
|--------|----------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemini 3.1 Flash Lite Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Instalacion

### BRAT (Recomendado)
1. Instala el plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Abre configuracion de BRAT -> "Add Beta plugin"
3. Ingresa: `https://github.com/takeshy/obsidian-gemini-helper`
4. Habilita el plugin en la configuracion de Community plugins

### Manual
1. Descarga `main.js`, `manifest.json`, `styles.css` de releases
2. Crea la carpeta `gemini-helper` en `.obsidian/plugins/`
3. Copia los archivos y habilita en la configuracion de Obsidian

### Desde el Codigo Fuente
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configuracion

### Configuracion de API
1. Obten la clave API de [ai.google.dev](https://ai.google.dev)
2. Ingresala en la configuracion del plugin
3. Selecciona el plan de API (Gratuito/De Pago)

![Configuracion Basica](docs/images/setting_basic.png)

### Configuracion del Espacio de Trabajo
- **System Prompt** - Instrucciones adicionales para la IA
- **Tool Limits** - Controla los limites de llamadas a funciones

![Limites de Herramientas](docs/images/setting_tool_history.png)

### Cifrado

Protege tu historial de chat y registros de ejecucion de workflows con contrasena por separado.

**Configuracion:**

1. Establece una contrasena en la configuracion del plugin (almacenada de forma segura usando criptografia de clave publica)

![Configuracion Inicial de Cifrado](docs/images/setting_initial_encryption.png)

2. Despues de la configuracion, activa el cifrado para cada tipo de registro:
   - **Cifrar historial de chat de IA** - Cifra los archivos de conversacion de chat
   - **Cifrar registros de ejecucion de workflows** - Cifra los archivos de historial de workflows

![Configuracion de Cifrado](docs/images/setting_encryption.png)

Cada configuracion puede habilitarse/deshabilitarse de forma independiente.

**Caracteristicas:**
- **Controles separados** - Elige que registros cifrar (chat, workflow, o ambos)
- **Cifrado automatico** - Los nuevos archivos se cifran al guardar segun la configuracion
- **Cache de contrasena** - Ingresa la contrasena una vez por sesion
- **Visor dedicado** - Los archivos cifrados se abren en un editor seguro con vista previa
- **Opcion de descifrado** - Elimina el cifrado de archivos individuales cuando sea necesario

**Como funciona:**

```
[Configuracion - una vez al establecer la contrasena]
Contrasena -> Generar par de claves (RSA) -> Cifrar clave privada -> Guardar en configuracion

[Cifrado - para cada archivo]
Contenido del archivo -> Cifrar con nueva clave AES -> Cifrar clave AES con clave publica
-> Guardar en archivo: datos cifrados + clave privada cifrada (de configuracion) + salt

[Descifrado]
Contrasena + salt -> Restaurar clave privada -> Descifrar clave AES -> Descifrar contenido
```

- El par de claves se genera una vez (la generacion RSA es lenta), la clave AES se genera por archivo
- Cada archivo almacena: contenido cifrado + clave privada cifrada (copiada de la configuracion) + salt
- Los archivos son autocontenidos -- descifrables solo con la contrasena, sin dependencia del plugin

<details>
<summary>Script Python de descifrado (clic para expandir)</summary>

```python
#!/usr/bin/env python3
"""Descifrar archivos encriptados de Gemini Helper sin el plugin."""
import base64, sys, re, getpass
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import padding

def decrypt_file(filepath: str, password: str) -> str:
    with open(filepath, 'r') as f:
        content = f.read()

    match = re.match(r'^---\n([\s\S]*?)\n---\n([\s\S]*)$', content)
    if not match:
        raise ValueError("Formato de archivo encriptado invalido")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("Falta key o salt en frontmatter")

    enc_private_key = base64.b64decode(key_match.group(1).strip())
    salt = base64.b64decode(salt_match.group(1).strip())
    data = base64.b64decode(encrypted_data.strip())

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    derived_key = kdf.derive(password.encode())

    iv, enc_priv = enc_private_key[:12], enc_private_key[12:]
    private_key_pem = AESGCM(derived_key).decrypt(iv, enc_priv, None)
    private_key = serialization.load_der_private_key(base64.b64decode(private_key_pem), None)

    key_len = (data[0] << 8) | data[1]
    enc_aes_key = data[2:2+key_len]
    content_iv = data[2+key_len:2+key_len+12]
    enc_content = data[2+key_len+12:]

    aes_key = private_key.decrypt(enc_aes_key, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

    return AESGCM(aes_key).decrypt(content_iv, enc_content, None).decode('utf-8')

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Uso: {sys.argv[0]} <archivo_encriptado>")
        sys.exit(1)
    password = getpass.getpass("Contrasena: ")
    print(decrypt_file(sys.argv[1], password))
```

Requiere: `pip install cryptography`

</details>

> **Advertencia:** Si olvidas tu contrasena, los archivos cifrados no se pueden recuperar. Guarda tu contrasena de forma segura.

> **Consejo:** Para cifrar todos los archivos de un directorio a la vez, usa un workflow. Consulta el ejemplo "Cifrar todos los archivos de un directorio" en [WORKFLOW_NODES_es.md](docs/WORKFLOW_NODES_es.md#obsidian-command).

![Flujo de Cifrado de Archivos](docs/images/enc.png)

**Beneficios de seguridad:**
- **Protegido del chat de IA** - Los archivos cifrados no pueden ser leidos por las operaciones de vault de IA (herramienta `read_note`). Esto mantiene los datos sensibles como claves API a salvo de exposicion accidental durante el chat.
- **Acceso desde workflow con contrasena** - Los workflows pueden leer archivos cifrados usando el nodo `note-read`. Al acceder, aparece un dialogo de contrasena, y la contrasena se almacena en cache para la sesion.
- **Almacena secretos de forma segura** - En lugar de escribir claves API directamente en workflows, almacenalas en archivos cifrados. El workflow lee la clave en tiempo de ejecucion despues de la verificacion de contrasena.

### Comandos Slash
- Define plantillas de prompts personalizadas activadas por `/`
- Modelo y busqueda opcionales por comando

![Comandos Slash](docs/images/setting_slash_command.png)

## Requisitos

- Obsidian v0.15.0+
- Clave API de Google AI
- Soporte para escritorio y movil

## Privacidad

**Datos almacenados localmente:**
- Clave API (almacenada en configuracion de Obsidian)
- Historial de chat (como archivos Markdown, opcionalmente cifrados)
- Historial de ejecucion de workflow (opcionalmente cifrado)
- Claves de cifrado (clave privada cifrada con tu contrasena)

**Datos enviados a Google:**
- Todos los mensajes de chat y archivos adjuntos se envian a la API de Google Gemini para procesamiento
- Cuando RAG esta habilitado, los archivos del vault se suben a Google File Search
- Cuando la Busqueda Web esta habilitada, las consultas se envian a Google Search

**Datos enviados a servicios de terceros:**
- Los nodos `http` de flujos de trabajo pueden enviar datos a cualquier URL especificada en el flujo de trabajo

**Servidores MCP (opcional):**
- Los servidores MCP (Model Context Protocol) pueden configurarse en los ajustes del plugin para nodos `mcp` de workflows
- Los servidores MCP son servicios externos que proporcionan herramientas y capacidades adicionales

**Notas de seguridad:**
- Revisa los flujos de trabajo antes de ejecutarlos - los nodos `http` pueden transmitir datos del vault a endpoints externos
- Los nodos `note` de flujos de trabajo muestran un dialogo de confirmacion antes de escribir archivos (comportamiento predeterminado)
- Los comandos slash con `confirmEdits: false` aplicaran automaticamente las ediciones de archivos sin mostrar botones Apply/Discard
- Credenciales sensibles: No almacenes claves API ni tokens directamente en el YAML del workflow (encabezados `http`, configuracion `mcp`, etc.). En su lugar, guardalos en archivos cifrados y usa el nodo `note-read` para obtenerlos en tiempo de ejecucion. Los workflows pueden leer archivos cifrados con solicitud de contrasena.

Consulta los [Terminos de Servicio de Google AI](https://ai.google.dev/terms) para politicas de retencion de datos.

## Licencia

MIT

## Enlaces

- [Documentacion de la API de Gemini](https://ai.google.dev/docs)
- [Documentacion de Plugins de Obsidian](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Apoyo

Si encuentras util este plugin, considera invitarme un cafe!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
