# Skills de Agente

Los Skills de Agente extienden las capacidades de la IA proporcionando instrucciones personalizadas, materiales de referencia y flujos de trabajo ejecutables. Los skills siguen el patrón estándar de la industria utilizado por herramientas como [OpenAI Codex](https://github.com/openai/codex).

## Estructura de Carpetas

Los skills se almacenan en una carpeta configurable dentro de tu vault (por defecto: `skills/`). Cada skill es una subcarpeta que contiene un archivo `SKILL.md`:

```
skills/
├── code-review/
│   ├── SKILL.md            # Definición del skill (requerido)
│   ├── references/          # Documentos de referencia (opcional)
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # Flujos de trabajo ejecutables (opcional)
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## Formato de SKILL.md

Cada archivo `SKILL.md` tiene un frontmatter YAML para metadatos y un cuerpo en markdown para las instrucciones:

```markdown
---
name: Code Review
description: Revisa bloques de código en notas para calidad y buenas prácticas
workflows:
  - path: workflows/run-lint.md
    description: Ejecutar linting en la nota actual
---

Eres un asistente de revisión de código. Al revisar código:

1. Busca errores comunes y antipatrones
2. Sugiere mejoras para la legibilidad
3. Verifica que el manejo de errores sea adecuado
4. Consulta la guía de estilo para las reglas de formato
```

### Campos del Frontmatter

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `name` | No | Nombre visible del skill. Por defecto usa el nombre de la carpeta |
| `description` | No | Descripción corta que se muestra en el selector de skills |
| `workflows` | No | Lista de referencias a flujos de trabajo (ver abajo) |

### Referencias de Flujos de Trabajo

Los flujos de trabajo declarados en el frontmatter se registran como herramientas de Function Calling que la IA puede invocar:

```yaml
workflows:
  - path: workflows/run-lint.md
    name: lint              # ID personalizado opcional (por defecto se basa en la ruta)
    description: Ejecutar linting en la nota actual
```

Los flujos de trabajo en el subdirectorio `workflows/` también se descubren automáticamente incluso sin declaraciones en el frontmatter. Los flujos de trabajo descubiertos automáticamente usan el nombre base del archivo como descripción.

## Referencias

Coloca los documentos de referencia en una subcarpeta `references/`. Estos se cargan automáticamente y se incluyen en el contexto de la IA cuando el skill está activo. Usa las referencias para:

- Guías de estilo y estándares de código
- Plantillas y ejemplos
- Listas de verificación y procedimientos
- Conocimiento específico del dominio

## Flujos de Trabajo

Los flujos de trabajo de skills usan el mismo formato que el [Constructor de Flujos de Trabajo](../README_es.md#constructor-de-flujos-de-trabajo). Coloca los archivos markdown de flujos de trabajo en la subcarpeta `workflows/`:

````markdown
```workflow
name: Run Lint
nodes:
  - id: read
    type: prompt-file
    saveTo: file
  - id: lint
    type: command
    prompt: "Check the following for lint issues:\n{{file.content}}"
    saveTo: result
  - id: show
    type: dialog
    title: Lint Results
    message: "{{result}}"
```
````

Cuando un skill con flujos de trabajo está activo, la IA recibe una herramienta `run_skill_workflow` que puede invocar para ejecutar estos flujos de trabajo. El formato del ID del flujo de trabajo es `skillName/workflowName` (ej., `Code Review/workflows_run-lint`).

### Ejecución Headless

Los flujos de trabajo de skills se ejecutan en modo headless:

- Los prompts interactivos (`dialog`, `prompt-file`, `prompt-selection`) se omiten (devuelven null)
- Los diálogos de confirmación se confirman automáticamente
- La IA recibe los registros de ejecución del flujo de trabajo como resultado de la herramienta

## Uso de Skills en el Chat

### Configuración

1. Abre la configuración del plugin
2. Busca la sección **Skills de agente**
3. Establece la ruta de la carpeta de skills (por defecto: `skills`)

### Activación de Skills

Los skills aparecen en el área de entrada del chat cuando están disponibles:

1. Haz clic en el botón **+** junto al área de chips de skills
2. Selecciona skills del menú desplegable para activarlos
3. Los skills activos se muestran como chips que se pueden eliminar haciendo clic en **x**

Cuando los skills están activos:

- Las instrucciones y referencias del skill se inyectan en el prompt del sistema
- Si los skills tienen flujos de trabajo, la herramienta `run_skill_workflow` queda disponible
- El mensaje del asistente muestra qué skills se utilizaron

### Ejemplo: Crear un Skill

1. Crea una carpeta: `skills/summarizer/`
2. Crea `skills/summarizer/SKILL.md`:

```markdown
---
name: Summarizer
description: Resume notas en formato de viñetas
---

Cuando se te pida resumir, sigue estas reglas:

- Usa viñetas concisas
- Agrupa elementos relacionados bajo encabezados
- Incluye fechas clave y elementos de acción
- Mantén los resúmenes por debajo de 500 palabras
```

3. Abre el chat, haz clic en **+** para activar el skill "Summarizer"
4. Pide a la IA que resuma una nota — seguirá las instrucciones del skill

## Skills de Ejemplo

### Guía de Estilo de Escritura (Instrucciones + Referencias)

Un skill que mantiene un estilo de escritura consistente usando un documento de referencia.

#### Estructura de carpetas

```
skills/
└── writing-style/
    ├── SKILL.md
    └── references/
        └── style-guide.md
```

#### `SKILL.md`

```markdown
---
name: Writing Style
description: Mantiene un tono y formato consistentes para publicaciones de blog
---

Eres un asistente de escritura. Sigue siempre la guía de estilo en las referencias.

Al revisar o escribir texto:

1. Usa la voz y el tono especificados en la guía de estilo
2. Sigue las reglas de formato (encabezados, listas, énfasis)
3. Aplica las preferencias de vocabulario (palabras preferidas/a evitar)
4. Señala cualquier violación de estilo al revisar texto existente
```

#### `references/style-guide.md`

```markdown
# Guía de Estilo del Blog

## Voz y Tono
- Conversacional pero profesional
- Se prefiere la voz activa
- Segunda persona ("tú") para tutoriales, primera persona del plural ("nosotros") para anuncios

## Formato
- H2 para secciones principales, H3 para subsecciones
- Usar listas con viñetas para 3+ elementos
- Negrita para elementos de interfaz y términos clave
- Bloques de código con etiquetas de idioma

## Vocabulario
- Preferir: "usar" en vez de "utilizar", "empezar" en vez de "iniciar", "ayudar" en vez de "facilitar"
- Evitar: jerga sin explicación, construcciones pasivas, palabras de relleno ("muy", "realmente", "simplemente")
```

---

### Diario (Instrucciones + Flujo de Trabajo)

Un skill que ayuda a mantener un diario con un flujo de trabajo para crear la entrada del día.

#### Estructura de carpetas

```
skills/
└── daily-journal/
    ├── SKILL.md
    └── workflows/
        └── create-entry.md
```

#### `SKILL.md`

```markdown
---
name: Daily Journal
description: Asistente de diario con creación de entradas
workflows:
  - path: workflows/create-entry.md
    description: Crear la entrada del diario de hoy a partir de la plantilla
---

Eres un asistente de diario. Ayuda al usuario a reflexionar sobre su día.

Cuando el usuario pida escribir una entrada de diario:

1. Usa primero el flujo de trabajo para crear el archivo de notas de hoy
2. Pregunta sobre lo destacado, los desafíos y los aprendizajes
3. Formatea las entradas con la estructura ## Lo Destacado / ## Desafíos / ## Aprendizajes
4. Mantén un tono cálido y alentador
5. Sugiere preguntas de reflexión si el usuario parece atascado
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: Crear Entrada del Diario
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: create
    type: note
    path: "Journal/{{today}}.md"
    content: |
      # {{today}}

      ## Lo Destacado


      ## Desafíos


      ## Aprendizajes


      ## Mañana
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

Uso: Activa el skill y pide "Crea la entrada del diario de hoy" — la IA ejecuta el flujo de trabajo para crear el archivo y luego te ayuda a completarlo.

---

### Notas de Reunión (Instrucciones + Referencias + Flujo de Trabajo)

Un skill completo que combina instrucciones personalizadas, una plantilla de referencia y un flujo de trabajo para crear notas de reunión.

#### Estructura de carpetas

```
skills/
└── meeting-notes/
    ├── SKILL.md
    ├── references/
    │   └── template.md
    └── workflows/
        └── create-meeting.md
```

#### `SKILL.md`

```markdown
---
name: Meeting Notes
description: Toma de notas de reunión estructurada con plantilla y creación automática
workflows:
  - path: workflows/create-meeting.md
    description: Crear una nueva nota de reunión con asistentes y agenda
---

Eres un asistente de notas de reunión. Sigue la plantilla en las referencias.

Al ayudar con las notas de reunión:

1. Usa el flujo de trabajo para crear el archivo de notas de reunión
2. Sigue la estructura de la plantilla exactamente
3. Registra los elementos de acción con responsables y fechas límite en el formato: `- [ ] [Responsable] Elemento de acción (fecha límite: YYYY-MM-DD)`
4. Resume las decisiones de forma clara y separada de la discusión
5. Después de la reunión, ofrece extraer los elementos de acción como tareas
```

#### `references/template.md`

```markdown
# Plantilla de Notas de Reunión

## Secciones Requeridas

### Encabezado
- **Título**: Tema de la reunión
- **Fecha**: YYYY-MM-DD
- **Asistentes**: Lista de participantes

### Agenda
Lista numerada de temas de discusión.

### Notas
Detalles de la discusión organizados por punto de la agenda. Usar sub-encabezados.

### Decisiones
Lista con viñetas de las decisiones tomadas. Cada una debe ser clara y accionable.

### Elementos de Acción
Lista de casillas con responsable y fecha límite:
- [ ] [Responsable] Descripción (fecha límite: YYYY-MM-DD)

### Próximos Pasos
Resumen breve de seguimientos y fecha de la próxima reunión si corresponde.
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: Crear Nota de Reunión
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: gen
    type: command
    prompt: |
      Genera una ruta de archivo y contenido inicial para una nota de reunión.
      La fecha de hoy es {{today}}.
      El tema de la reunión es: {{topic}}
      Asistentes: {{attendees}}

      Devuelve SOLO un objeto JSON:
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...contenido markdown siguiendo la plantilla..."}

      Usa la estructura de la plantilla: Encabezado con fecha/asistentes, Agenda (del tema), secciones vacías de Notas/Decisiones/Elementos de Acción/Próximos Pasos.
    saveTo: generated
  - id: parse
    type: json
    input: "{{generated}}"
    saveTo: parsed
  - id: create
    type: note
    path: "{{parsed.path}}"
    content: "{{parsed.content}}"
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "{{parsed.path}}"
```
````

Uso: Activa el skill y di "Crea notas de reunión para la revisión de diseño con Alice, Bob y Carol" — la IA ejecuta el flujo de trabajo con tema/asistentes, crea una nota estructurada y la abre.

---

## Configuración

| Opción | Valor por defecto | Descripción |
|--------|-------------------|-------------|
| Carpeta de skills | `skills` | Ruta a la carpeta de skills en tu vault |
