# DBML Diagram Viewer

Una extensión de VS Code para previsualizar diagramas de bases de datos relacionales escritos en DBML (Database Markup Language).

## Características

- 📝 **Sintaxis DBML**: Soporte completo para archivos `.dbml`
- 👁️ **Vista previa en tiempo real**: Botón de ojo en la barra del editor para abrir la vista previa
- 🎨 **Adaptación de tema**: Los colores del diagrama se adaptan automáticamente al tema de VS Code
- 🔄 **Actualización automática**: La vista previa se actualiza cuando guardas cambios en el archivo DBML

## Uso

1. Abre o crea un archivo con extensión `.dbml`
2. Escribe tu esquema de base de datos en sintaxis DBML
3. Haz clic en el icono de ojo (👁️) en la esquina superior derecha del editor
4. La vista previa del diagrama aparecerá en un panel lateral

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
- Soporte básico para archivos DBML
- Vista previa de diagramas con adaptación de tema
- Actualización automática al editar

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
