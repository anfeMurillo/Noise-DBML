# NOISE DBML

Visual Studio Code extension for previewing DBML (Database Markup Language) relational diagrams.

## Features

### Interactive Preview
- **Visual Diagram**: Render your DBML code as an interactive entity-relationship diagram.
- **Interactive Controls**: Pan, zoom, and drag tables to organize your view.
- **Layout Persistence**: The extension remembers your table positions and layout even after you close VS Code.
- **Theme Adaptation**: Automatically adapts to your VS Code color theme (Light/Dark/High Contrast).

### Diagram Views
- **Create Views**: Create specific views to focus on a subset of tables.
- **Manage Views**: Rename or delete views as needed.
- **Filter Tables**: Select which tables to show in each view for better clarity in large schemas.

### Documentation and Export
- **Documentation Generation**: Generate Markdown documentation for your database schema directly from the preview.
- **SQL Generation**: Convert your DBML schema to SQL scripts (CREATE TABLE, etc.) for multiple database dialects.
- **Tooltips**: Hover over fields to see their notes/comments.

### Productivity Snippets
Speed up your workflow with built-in snippets:
- `table`: Create a new table with ID and sample column.
- `group`: Create a TableGroup.
- `project`: Create a Project definition.
- `enum`: Create an Enum definition.
- `indexes`: Create an Indexes block.

## Syntax Guide

### Groups
Group related tables using `TableGroup`. Groups are visualized with a colored background.

```dbml
TableGroup user_management {
  users
  follows
  // You can add a color or note
  note: "Core user tables"
}
```

### Schemas
Organize tables into schemas using the `note` property. Add `schema: your_schema_name` to the table note.

```dbml
Table users {
  id integer
  username varchar
  note: "schema: auth" // Belongs to 'auth' schema
}
```

### Enums
Define reusable enum types.

```dbml
Enum job_status {
  created
  running
  done
  failure
}
```

### Relationships
Relationships can be defined in two ways:

**1. Explicit Ref block:**
```dbml
Ref: users.id < posts.user_id
```

**2. Inline column definition:**
```dbml
Table posts {
  user_id integer [ref: > users.id]
}
```

Supported relationship types:
- `One-to-One`: `-`
- `One-to-Many`: `<`
- `Many-to-One`: `>`

## Usage

### Visual Preview
1. Open a `.dbml` file.
2. Click the **Open DBML Preview** icon in the editor title bar (or run the command `Noise DBML: Open DBML Preview`).
3. Arrange your tables as desired.
4. Use the toolbar in the preview to manage views or generate documentation.

### Generate SQL
1. Open a `.dbml` file.
2. Click the **Generate SQL** icon in the editor title bar (or run the command `DBML: Generate SQL`).
3. Select your target SQL dialect:
   - PostgreSQL
   - MySQL
   - SQLite
   - SQL Server
4. Choose whether to include DROP TABLE statements.
5. The generated SQL will open in a new editor window.

The SQL generator supports:
- CREATE TABLE statements with appropriate data types for each dialect
- Primary keys and unique constraints
- Foreign key relationships with ON DELETE/ON UPDATE actions
- NOT NULL and AUTO_INCREMENT/IDENTITY columns
- Table and column comments (where supported by the dialect)
- Schema support (except for SQLite)

## Requirements

- VS Code 1.80.0 or higher.

## Extension Settings

This extension currently does not have any configurable settings.
