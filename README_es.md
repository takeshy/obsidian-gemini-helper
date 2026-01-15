# Gemini Helper para Obsidian

Asistente de IA **gratuito y de código abierto** para Obsidian con **Chat**, **Automatización de Flujos de Trabajo** y **RAG** impulsado por Google Gemini.

> **Este plugin es completamente gratuito.** Solo necesitas una clave API de Google Gemini (gratuita o de pago) de [ai.google.dev](https://ai.google.dev), o usar herramientas CLI: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code) o [Codex CLI](https://github.com/openai/codex).

## Características Principales

- **Chat con IA** - Respuestas en streaming, archivos adjuntos, operaciones en el vault, comandos slash
- **Constructor de Flujos de Trabajo** - Automatiza tareas de múltiples pasos con editor visual de nodos y 22 tipos de nodos
- **Historial de Edición** - Rastrea y restaura cambios hechos por IA con vista de diferencias
- **RAG** - Generación Aumentada por Recuperación para búsqueda inteligente en tu vault
- **Búsqueda Web** - Accede a información actualizada a través de Google Search
- **Generación de Imágenes** - Crea imágenes con los modelos de imagen de Gemini
- **Cifrado** - Protege con contraseña el historial de chat y los registros de ejecución de workflows

![Generación de imágenes en el chat](chat_image.png)

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

### Modo de Herramientas del Vault

Controla qué herramientas del vault puede usar la IA mediante el icono de base de datos (📦) debajo del botón de adjuntos:

| Modo | Descripción | Herramientas Disponibles |
|------|-------------|--------------------------|
| **Vault: Todo** | Acceso completo al vault | Todas las herramientas |
| **Vault: Sin búsqueda** | Excluir herramientas de búsqueda | Todas excepto `search_notes`, `list_notes` |
| **Vault: Desactivado** | Sin acceso al vault | Ninguna |

**Selección automática de modo:**

| Condición | Modo Predeterminado | Modificable |
|-----------|---------------------|-------------|
| Modelos CLI (Gemini/Claude/Codex CLI) | Vault: Desactivado | No |
| Modelos Gemma | Vault: Desactivado | No |
| Web Search habilitado | Vault: Desactivado | No |
| Flash Lite + RAG | Vault: Desactivado | No |
| RAG habilitado | Vault: Sin búsqueda | Sí |
| Sin RAG | Vault: Todo | Sí |

> **Consejo:** Al usar RAG, se recomienda "Vault: Sin búsqueda" para evitar búsquedas redundantes – RAG ya proporciona búsqueda semántica en todo el vault.

## Edición Segura

Cuando la IA usa `propose_edit`:
1. Un diálogo de confirmación muestra los cambios propuestos
2. Haz clic en **Apply** para escribir los cambios en el archivo
3. Haz clic en **Discard** para cancelar sin modificar el archivo

> Los cambios NO se escriben hasta que confirmes.

## Historial de Edición

Rastrea y restaura cambios hechos a tus notas:

- **Seguimiento automático** - Todas las ediciones de IA (chat, flujo de trabajo) y cambios manuales se registran
- **Ver historial** - Comando: "Show edit history" o usa la paleta de comandos
- **Vista de diferencias** - Ve exactamente qué cambió con adiciones/eliminaciones codificadas por color
- **Restaurar** - Revierte a cualquier versión anterior con un clic
- **Modal redimensionable** - Arrastra para mover, redimensiona desde las esquinas

**Visualización de diferencias:**
- Las líneas `+` existían en la versión anterior
- Las líneas `-` fueron añadidas en la versión más nueva

**Cómo funciona:**

El historial de edición usa un enfoque basado en instantáneas:

1. **Creación de instantánea** - Cuando un archivo se abre por primera vez o es modificado por IA, se guarda una instantánea de su contenido
2. **Registro de diferencias** - Cuando el archivo se modifica, la diferencia entre el nuevo contenido y la instantánea se registra como una entrada de historial
3. **Actualización de instantánea** - La instantánea se actualiza al nuevo contenido después de cada modificación
4. **Restaurar** - Para restaurar a una versión anterior, las diferencias se aplican en reversa desde la instantánea

**Cuándo se registra el historial:**
- Ediciones de chat IA (herramienta `propose_edit`)
- Modificaciones de notas en flujos de trabajo (nodo `note`)
- Guardados manuales vía comando
- Auto-detección cuando el archivo difiere de la instantánea al abrir

**Ubicación de almacenamiento:**
- Archivos de historial: `{workspaceFolder}/history/{filename}.history.md`
- Archivos de instantánea: `{workspaceFolder}/history/{filename}.snapshot.md`

**Configuración:**
- Habilitar/deshabilitar en configuración del plugin
- Configurar líneas de contexto para diferencias
- Establecer límites de retención (máximo de entradas por archivo, edad máxima)

![Modal de Historial de Edición](edit_history.png)

## RAG

Generación Aumentada por Recuperación para búsqueda inteligente en el vault:

- **Archivos soportados** - Markdown, PDF, Imágenes (PNG, JPEG, GIF, WebP)
- **Modo interno** - Sincroniza archivos del vault con Google File Search
- **Modo externo** - Usa IDs de almacenes existentes
- **Sincronización incremental** - Solo sube archivos modificados
- **Carpetas objetivo** - Especifica carpetas a incluir
- **Patrones de exclusión** - Patrones regex para excluir archivos

![Configuración RAG](setting_rag.png)

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

Hay 22 tipos de nodos disponibles para construir flujos de trabajo:

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
| Externos | `mcp`, `obsidian-command` |

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
- **Edit History** - Rastrea y restaura cambios hechos por IA

![Límite de Herramientas e Historial de Edición](setting_tool_history.png)

### Comandos Slash
- Define plantillas de prompts personalizadas activadas por `/`
- Modelo y búsqueda opcionales por comando

![Comandos Slash](setting_slash_command.png)

### Cifrado

Protege tu historial de chat y registros de ejecución de workflows con contraseña.

> **Requerido:** Primero debes establecer una contraseña en la configuración del plugin para habilitar el cifrado.

![Configuración de Cifrado](setting_encryption.png)

**Configuración:**
1. Habilitar cifrado en la configuración del plugin
2. Establecer una contraseña (almacenada de forma segura usando criptografía de clave pública)
3. Todos los nuevos archivos de chat e historial de workflow serán cifrados

**Características:**
- **Cifrado automático** - Los nuevos chats y registros de workflow se cifran al guardar
- **Caché de contraseña** - Ingresa la contraseña una vez por sesión
- **Visor dedicado** - Los archivos cifrados se abren en un editor seguro con vista previa
- **Opción de descifrado** - Elimina el cifrado de archivos individuales cuando sea necesario

**Cómo funciona:**

```
[Cifrado]
Contraseña → Generar par de claves → Cifrar clave privada con contraseña
Contenido → Cifrar con clave AES → Cifrar clave AES con clave pública
→ Guardar en archivo: datos cifrados + clave privada cifrada + salt

[Descifrado]
Contraseña + salt → Restaurar clave privada → Descifrar clave AES → Descifrar contenido
```

- Cada archivo almacena: contenido cifrado + clave privada cifrada + salt
- Los archivos son autocontenidos — descifrables solo con la contraseña, sin dependencia del plugin

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
        raise ValueError("Formato de archivo encriptado inválido")

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
    password = getpass.getpass("Contraseña: ")
    print(decrypt_file(sys.argv[1], password))
```

Requiere: `pip install cryptography`

</details>

> **Advertencia:** Si olvidas tu contraseña, los archivos cifrados no se pueden recuperar. Guarda tu contraseña de forma segura.

> **Consejo:** Para cifrar todos los archivos de un directorio a la vez, usa un workflow. Consulta el ejemplo "Cifrar todos los archivos de un directorio" en [WORKFLOW_NODES_es.md](WORKFLOW_NODES_es.md#obsidian-command).

![Flujo de Cifrado de Archivos](enc.png)

**Beneficios de seguridad:**
- **Protegido del chat de IA** - Los archivos cifrados no pueden ser leídos por las operaciones de vault de IA (herramienta `read_note`). Esto mantiene los datos sensibles como claves API a salvo de exposición accidental durante el chat.
- **Acceso desde workflow con contraseña** - Los workflows pueden leer archivos cifrados usando el nodo `note-read`. Al acceder, aparece un diálogo de contraseña, y la contraseña se almacena en caché para la sesión.
- **Almacena secretos de forma segura** - En lugar de escribir claves API directamente en workflows, almacénalas en archivos cifrados. El workflow lee la clave en tiempo de ejecución después de la verificación de contraseña.

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

**Visualizar como Diagrama de Flujo:** Haz clic en el botón **Canvas** (icono de cuadrícula) en el panel de Workflow para exportar tu flujo de trabajo como un Canvas de Obsidian. Esto crea un diagrama de flujo visual donde:
- Los bucles y las ramificaciones se muestran claramente con enrutamiento adecuado
- Los nodos de decisión (`if`/`while`) muestran rutas Sí/No
- Las flechas de retroceso se enrutan alrededor de los nodos para mayor claridad
- Cada nodo muestra su configuración completa
- Se incluye un enlace al archivo de workflow de origen para navegación rápida

![Workflow to Canvas](workflow_to_canvas.png)

Esto es especialmente útil para entender flujos de trabajo complejos con múltiples ramificaciones y bucles.

**Exportar historial de ejecución:** Visualiza el historial de ejecución como un Canvas de Obsidian para análisis visual. Haz clic en **Open Canvas view** en el modal de Historial para crear un archivo Canvas.

> **Nota:** Los archivos Canvas se crean dinámicamente en la carpeta del workspace. Elimínalos manualmente después de revisarlos si ya no los necesitas.

![Vista de Canvas del Historial](history_canvas.png)

### Generación de Flujos de Trabajo con IA

**Crear Nuevo Flujo de Trabajo con IA:**
1. Selecciona **+ New (AI)** del menú desplegable de workflow
2. Ingresa el nombre del flujo de trabajo y la ruta de salida (soporta la variable `{{name}}`)
3. Describe lo que el flujo de trabajo debe hacer en lenguaje natural
4. Selecciona un modelo y haz clic en **Generate**
5. El flujo de trabajo se crea y guarda automáticamente

> **Consejo:** Al usar **+ New (AI)** desde el menú desplegable en un archivo que ya tiene flujos de trabajo, la ruta de salida se establece por defecto al archivo actual. El flujo de trabajo generado se añadirá a ese archivo.

**Crear flujo de trabajo desde cualquier archivo:**

Al abrir la pestaña Workflow con un archivo que no tiene bloque de código workflow, se muestra un botón **"Create workflow with AI"**. Haz clic para generar un nuevo flujo de trabajo (salida predeterminada: `workflows/{{name}}.md`).

**Referencias de Archivos con @:**

Escribe `@` en el campo de descripción para referenciar archivos:
- `@{selection}` - Selección actual del editor
- `@{content}` - Contenido de la nota activa
- `@path/to/file.md` - Cualquier archivo del vault

Cuando haces clic en Generate, el contenido del archivo se incrusta directamente en la solicitud de IA. El frontmatter YAML se elimina automáticamente.

> **Consejo:** Esto es útil para crear flujos de trabajo basados en ejemplos o plantillas de workflow existentes en tu vault.

**Archivos Adjuntos:**

Haz clic en el botón de adjuntos para adjuntar archivos (imágenes, PDFs, archivos de texto) a tu solicitud de generación de flujo de trabajo. Esto es útil para proporcionar contexto visual o ejemplos a la IA.

**Controles del Modal:**

El modal de flujo de trabajo con IA soporta posicionamiento con arrastrar y soltar y redimensionamiento desde las esquinas para una mejor experiencia de edición.

**Historial de Solicitudes:**

Cada flujo de trabajo generado por IA guarda una entrada de historial sobre el bloque de código del workflow, incluyendo:
- Marca de tiempo y acción (Creado/Modificado)
- Tu descripción de la solicitud
- Contenidos de archivos referenciados (en secciones colapsables)

![Historial de IA del Workflow](workflow_ai_history.png)

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
- Clave API (almacenada en configuración de Obsidian)
- Historial de chat (como archivos Markdown, opcionalmente cifrados)
- Historial de ejecución de workflow (opcionalmente cifrado)
- Claves de cifrado (clave privada cifrada con tu contraseña)

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
