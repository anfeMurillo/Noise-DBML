# DBML Diagram Viewer

Una extensión de VS Code para previsualizar diagramas de bases de datos relacionales escritos en DBML (Database Markup Language).

## Características

- 📝 **Sintaxis DBML**: Soporte completo para archivos `.dbml`
- 👁️ **Vista previa**: Botón de ojo en la barra del editor para abrir la vista previa
- 🎨 **Adaptación de tema**: Los colores del diagrama se adaptan automáticamente al tema de VS Code
- 💾 **Actualización al guardar**: La vista previa se actualiza solo cuando guardas el archivo (Ctrl+S)
- 🖱️ **Tablas movibles**: Arrastra y suelta las tablas para reorganizar el diagrama libremente
- 🔗 **Etiquetas de cardinalidad**: Las relaciones muestran su tipo directamente:
  - `1:1` = Uno a uno (one-to-one)
  - `1:n` = Uno a muchos (one-to-many)
  - `n:n` = Muchos a muchos (many-to-many)
  - `0:1` = Cero o uno (optional relationship)
- 🎨 **Líneas interactivas**: Estados de color dinámicos
  - **Pasivo**: Color suave cuando no hay interacción
  - **Activo**: Color vivo cuando pasas el mouse sobre una tabla relacionada
- ∞ **Lienzo infinito**: Canvas sin límites con pan y zoom
  - Arrastra el fondo para desplazarte por el canvas
  - Usa la rueda del mouse para hacer zoom
  - Las tablas se ajustan a una cuadrícula invisible
  - **Posiciones persistentes**: Las ubicaciones se guardan automáticamente
- 📐 **Líneas inteligentes**: Las relaciones siguen rutas ortogonales (solo ángulos de 0° y 90°) con esquinas redondeadas

## Uso

1. Abre o crea un archivo con extensión `.dbml`
2. Escribe tu esquema de base de datos en sintaxis DBML
3. Haz clic en el icono de ojo (👁️) en la esquina superior derecha del editor
4. La vista previa del diagrama aparecerá en un panel lateral

### Controles del diagrama

- **Mover tablas**: Haz clic y arrastra una tabla a una nueva posición
- **Pan (desplazar)**: Haz clic y arrastra el fondo del canvas
- **Zoom**: Usa la rueda del mouse para acercar/alejar
- **Ver relaciones**: Pasa el mouse sobre una tabla para resaltar sus conexiones
- **Auto-guardado**: Las posiciones y el zoom se guardan automáticamente y persisten entre sesiones

## Ejemplo de sintaxis DBML

```dbml
Table users {
  id integer [primary key]
  username varchar(50) [not null, unique]
  email varchar(100) [not null, unique]
  created_at timestamp [default: `now()`]
}

Table posts {
  id integer [primary key]
  user_id integer [not null, ref: > users.id]
  title varchar(255) [not null]
  content text
  published boolean [default: false]
}

Ref: posts.user_id > users.id [delete: cascade]
```

## Desarrollo

Para ejecutar esta extensión en modo desarrollo:

1. Presiona `F5` para abrir una nueva ventana de VS Code con la extensión cargada
2. Abre el archivo `example.dbml` incluido para probar la funcionalidad
3. Haz clic en el icono de ojo en la esquina superior derecha

## Comandos

- `DBML: Open Preview` - Abre la vista previa del diagrama DBML

## Release Notes

### 0.0.1

Versión inicial:
- Soporte básico para archivos DBML con syntax highlighting
- Vista previa de diagramas con adaptación automática al tema de VS Code
- Actualización al guardar (sin errores mientras escribes)
- Tablas arrastrables con posiciones persistentes entre sesiones
- Etiquetas de cardinalidad (1:1, 1:n, n:n) en lugar de flechas
- Líneas con estados: pasivo (suave) y activo (resaltado al hover)
- Canvas infinito con pan y zoom
- Líneas ortogonales inteligentes con esquinas redondeadas
- Alineación automática a cuadrícula invisible
- Relaciones dinámicas que se actualizan en tiempo real

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
