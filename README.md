# NOISE DBML

**Complete DBML support for Visual Studio Code** - Design, visualize, and export your database schemas with ease.

[![Version](https://img.shields.io/badge/version-0.0.7-blue.svg)](https://marketplace.visualstudio.com/items?itemName=AndrsFelipeMurillo.noise-dbml)
[![Visual Studio Marketplace](https://img.shields.io/badge/marketplace-install-blue.svg)](https://marketplace.visualstudio.com/items?itemName=AndrsFelipeMurillo.noise-dbml)

## 🚀 What's New in v0.0.7

- ✨ **Enhanced Documentation**: Comprehensive README with detailed usage guides
- 🔧 **Improved Reverse Engineering**: Better error handling and connection troubleshooting
- 🐛 **Bug Fixes**: Fixed SQLite Cloud connection issues
- 📊 **Better Examples**: More detailed connection string examples for all database types
- 🧪 **Testing Tools**: Included database connection testing scripts

## 🌟 Features

### 📊 Interactive Diagram Preview
Transform your DBML code into beautiful, interactive entity-relationship diagrams.

- **Visual Rendering**: See your database schema as a professional diagram
- **Drag & Drop**: Organize tables by dragging them around the canvas
- **Pan & Zoom**: Navigate large schemas with smooth controls
- **Layout Persistence**: Your table positions are automatically saved per file
- **Theme-Aware**: Seamlessly adapts to VS Code's light, dark, and high contrast themes
- **Export to PNG**: Save your diagram as an image file

### 👁️ Diagram Views
Create focused views to manage complex database schemas.

- **Multiple Views**: Define custom views showing only specific tables
- **Easy Management**: Create, rename, and delete views from the preview toolbar
- **Quick Switching**: Toggle between views to focus on different parts of your schema
- **Perfect for Large Schemas**: Hide irrelevant tables and reduce visual clutter

### 🛠️ Code Assistance

#### Syntax Highlighting
Full syntax highlighting for DBML files with proper color coding for:
- Tables, fields, and data types
- Relationships and references
- Annotations and settings
- Comments and notes

#### Auto-Formatting
- **Format on Save**: Automatically format DBML files when saving (enabled by default)
- **Column Alignment**: Aligns table columns for better readability
- **Consistent Style**: Maintains clean, professional code structure

#### Go to Definition
- **Quick Navigation**: `Ctrl+Click` (or `Cmd+Click` on Mac) on table references
- **Jump to Tables**: Navigate instantly to table definitions from relationships

#### IntelliSense & Snippets
Speed up development with smart code completion:

| Snippet | Trigger | Description |
|---------|---------|-------------|
| `table` | Type `table` + Tab | Create a complete table with ID, fields, and schema note |
| `group` | Type `group` + Tab | Create a TableGroup to organize related tables |
| `project` | Type `project` + Tab | Create a Project definition with database type |
| `enum` | Type `enum` + Tab | Define an Enum type for reusable values |
| `indexes` | Type `indexes` + Tab | Add an indexes block to a table |

#### Real-Time Diagnostics
- **Error Detection**: See syntax errors as you type
- **Clear Messages**: Helpful error messages with precise location
- **Problems Panel**: All errors shown in VS Code's Problems panel

### 📄 Documentation Generation
Generate comprehensive Markdown documentation automatically:

- **Table Descriptions**: All tables with their fields and types
- **Relationships**: Foreign keys and constraints clearly documented
- **Field Details**: Data types, constraints, and notes
- **One-Click Export**: Generate docs directly from the preview panel

### 🗄️ SQL Generation
Convert DBML to production-ready SQL scripts for any database:

- **Multi-Database Support**: PostgreSQL, MySQL, SQLite, SQL Server
- **Smart Type Mapping**: Automatic data type conversion for each dialect
- **Complete DDL**: CREATE TABLE, PRIMARY KEY, FOREIGN KEY constraints
- **Referential Integrity**: ON DELETE and ON UPDATE actions
- **Auto-Increment**: Proper SERIAL, IDENTITY, or AUTO_INCREMENT syntax
- **Comments**: Table and column descriptions (where supported)
- **Schema Support**: Multi-schema support (PostgreSQL, SQL Server)
- **Drop Statements**: Optional DROP TABLE statements for development

### 🔍 Anti-Pattern Detection
Automatically detect design issues and best practice violations:

- **Missing Primary Keys**: Identifies tables without primary keys
- **Excessive NULL Fields**: Detects tables with too many nullable columns (>50%)
- **Reserved Keywords**: Warns about SQL reserved words in table/field names
- **Naming Conventions**: Checks for invalid naming patterns
- **Large Tables**: Flags tables with too many columns (>20)
- **Circular Dependencies**: Detects mutual table references
- **Missing Indexes**: Suggests indexes for foreign key fields
- **Detailed Reports**: Provides clear explanations and recommendations

### 🎨 Table Groups
Organize and visualize related tables with colored backgrounds.

- **Visual Grouping**: Tables in the same group share a colored background
- **Color Options**: Choose from red, blue, green, yellow, orange, or purple
- **Documentation**: Add notes to describe each group's purpose

### 🔄 Reverse Engineering
Import existing database schemas into DBML format:

- **PostgreSQL**: Full support with schema detection and SSL handling
- **MySQL**: Complete table and relationship import
- **SQLite**: Local database file support and SQLite Cloud
- **SQL Server**: Enterprise database support
- **Connection Testing**: Built-in connection validation
- **Schema Discovery**: Automatic detection of available schemas
- **Constraint Import**: Primary keys, foreign keys, indexes, and defaults

## 📖 Quick Start Guide

### 1. Create a DBML File
Create a new file with the `.dbml` extension or use the `table` snippet:

```dbml
// Type 'table' and press Tab to use the snippet

Table users {
  id integer [primary key, increment]
  username varchar(50) [unique, not null]
  email varchar(100) [not null]
  created_at timestamp [default: `now()`]
  
  Note: 'User accounts table'
}

Table posts {
  id integer [primary key, increment]
  user_id integer [not null]
  title varchar(200) [not null]
  content text
  created_at timestamp [default: `now()`]
}

// Define relationships
Ref: posts.user_id > users.id [delete: cascade]
```

### 2. Preview the Diagram
- Click the **👁️ eye icon** in the editor toolbar, or
- Press `Ctrl+Shift+P` and run **"Open DBML Preview"**
- **Drag tables** to reposition them
- **Scroll** to zoom in/out
- **Pan** by dragging the background
- Use the toolbar to create views, generate docs, or export PNG

### 3. Generate SQL
- Click the **🗄️ database icon** in the editor toolbar, or
- Press `Ctrl+Shift+P` and run **"DBML: Generate SQL"**
- Select your database dialect (PostgreSQL, MySQL, SQLite, SQL Server)
- Choose options like including DROP statements
- Review and save the generated SQL

### 4. Detect Anti-Patterns
- Click the **⚠️ warning icon** in the editor toolbar, or
- Press `Ctrl+Shift+P` and run **"DBML: Detect Anti-Patterns"**
- Review the detailed report with errors, warnings, and suggestions

### 5. Reverse Engineer from Database
- Click the **☁️ cloud-download icon** in the editor toolbar, or
- Press `Ctrl+Shift+P` and run **"DBML: Reverse Engineer from Database"**
- Select your database type and provide connection details
- The extension will automatically detect schemas, tables, and relationships

## 🎯 Usage

### Reverse Engineering from Database

Import existing database schemas into DBML format with full support for multiple database types.

#### Supported Databases
- **PostgreSQL** - Full support with schema detection, SSL handling, and cloud databases
- **MySQL** - Complete table and relationship import with constraint detection
- **SQLite** - Local database files and SQLite Cloud support
- **SQL Server** - Enterprise database support with schema separation

#### PostgreSQL Connection Examples

**Local PostgreSQL:**
```
postgresql://username:password@localhost:5432/database_name
```

**Cloud Databases (Heroku, Railway, Supabase, etc.):**
```
postgres://username:password@host:5432/database_name?sslmode=require
```

**SSL Options:**
- `?sslmode=require` - Required for most cloud providers
- `?sslmode=prefer` - Attempts SSL but falls back if unavailable

#### MySQL Connection Examples

**Standard MySQL:**
```
mysql://username:password@localhost:3306/database_name
```

**Cloud MySQL (AWS RDS, Google Cloud SQL, etc.):**
```
mysql://username:password@host:3306/database_name?ssl=true
```

#### SQLite Options

**Local SQLite File:**
- Select "SQLite" → "Local File" and choose your `.db`, `.sqlite`, or `.sqlite3` file

**SQLite Cloud:**
- Select "SQLite" → "Online (SQLite Cloud)"
- Use connection strings like:
  ```
  sqlitecloud://username:password@host:8860/database
  https://your-project.sqlite.cloud/database
  ```

#### SQL Server Connection Examples

**Standard SQL Server:**
```
sqlserver://username:password@host:1433/database_name
```

**Azure SQL Database:**
```
sqlserver://username:password@server.database.windows.net:1433/database_name?encrypt=true
```

#### Connection Troubleshooting

**PostgreSQL Issues:**
- **SSL Required**: Add `?sslmode=require` for cloud databases
- **Schema Access**: Ensure user has `information_schema` permissions
- **Empty Results**: Tool searches multiple schemas if `public` is empty

**MySQL Issues:**
- **SSL Settings**: Use `?ssl=true` for cloud instances
- **Authentication**: Check if password contains special characters

**SQLite Issues:**
- **File Permissions**: Ensure read access to local database files
- **Cloud Connection**: Verify SQLite Cloud credentials and endpoint

**General Issues:**
- **Firewall**: Ensure database port is accessible
- **Timeouts**: Cloud databases may need longer connection timeouts
- **Test First**: Use the included test scripts to validate connections

#### What Gets Imported

The reverse engineering automatically detects and imports:
- ✅ All accessible database schemas
- ✅ Tables with columns, data types, and constraints
- ✅ Primary keys and auto-increment fields
- ✅ Foreign key relationships with cascade actions
- ✅ Unique constraints and indexes
- ✅ Default values and nullability settings
- ✅ Table and column comments (where supported)

## 🧪 Testing & Validation Tools

The extension includes built-in testing tools to help you validate database connections before reverse engineering:

### PostgreSQL Connection Tester
Test your PostgreSQL connections with detailed diagnostics:

```bash
# Test connection and get detailed information
node test-postgres-connection.js "postgresql://user:pass@host:5432/db"

# Test and generate DBML (requires manual DBML generation)
node test-postgres-connection.js "postgresql://user:pass@host:5432/db" --generate-dbml
```

**What it tests:**
- ✅ Database connectivity
- ✅ SSL configuration
- ✅ Schema access permissions
- ✅ Available tables and schemas
- ✅ Connection string validation

### SQLite Testing
```bash
# Test reverse engineering from SQLite file
node test-reverse-sqlite.js /path/to/database.db
```

### Included Test Files
- `test-postgres-connection.js` - PostgreSQL connection validator
- `test-reverse-postgres.js` - PostgreSQL reverse engineering test
- `test-reverse-sqlite.js` - SQLite reverse engineering test
- `test-user-dbml.dbml` - Sample DBML file for testing
- `examples/anti-patterns-demo.dbml` - Anti-patterns demonstration

### Visual Preview
1. Open any `.dbml` file
2. Click the preview icon (👁️) in the editor title bar
3. Interact with the diagram:
   - **Drag tables** to reposition them
   - **Scroll** to zoom in/out
   - **Pan** by dragging the background
4. Use the toolbar to:
   - Create and manage views
   - Generate documentation
   - Export diagram as PNG

### SQL Generation
1. Open a `.dbml` file
2. Click the database icon (🗄️) or use Command Palette
3. Choose your SQL dialect:
   - **PostgreSQL** - Modern features, JSONB, UUID support
   - **MySQL** - MariaDB compatible, AUTO_INCREMENT
   - **SQLite** - Embedded database, simplified types
   - **SQL Server** - Enterprise features, IDENTITY columns
4. Select options:
   - Include DROP TABLE statements (for dev environments)
5. Review and save the generated SQL

**Generated SQL includes:**
- ✅ CREATE TABLE statements
- ✅ Primary keys and constraints
- ✅ Foreign keys with actions (CASCADE, RESTRICT, etc.)
- ✅ Indexes and unique constraints
- ✅ Auto-increment/SERIAL columns
- ✅ Table and column comments
- ✅ NOT NULL constraints

### Using Snippets

Type the trigger word and press `Tab`:

**Create a Table:**
```dbml
table + Tab
```
Generates:
```dbml
Table table_name {
  id integer [primary key, increment]
  column_name type

  Note: '''
  schema: public
  # Your documentation here...
  '''
}
```

**Create a TableGroup:**
```dbml
group + Tab
```
Generates:
```dbml
TableGroup group_name {
  table_name
}
```

**Create a Project:**
```dbml
project + Tab
```
Generates:
```dbml
Project project_name {
  database_type: 'PostgreSQL'
  Note: 'Description of the project'
}
```

**Create an Enum:**
```dbml
enum + Tab
```
Generates:
```dbml
Enum enum_name {
  value
}
```

**Create Indexes:**
```dbml
indexes + Tab
```
Generates:
```dbml
indexes {
  column_name
}
```

### Anti-Pattern Detection

Analyze your database schema for common issues:

1. Open a `.dbml` file
2. Click the warning icon (⚠️) or use Command Palette
3. Review the generated report with:
   - **Errors**: Critical issues (e.g., empty tables)
   - **Warnings**: Important problems (e.g., missing primary keys)
   - **Info**: Suggestions (e.g., naming conventions)

**Examples of detected anti-patterns:**

- ✅ Tables without primary keys
- ✅ Too many nullable fields (>50%)
- ✅ Tables with too many columns (>20)
- ✅ SQL reserved keywords as names
- ✅ Invalid naming conventions
- ✅ Fields that look like IDs but aren't PKs
- ✅ Missing indexes on foreign keys
- ✅ Circular table dependencies

Each issue includes:
- Clear description of the problem
- Impact explanation
- Specific recommendation to fix it

## 📝 DBML Syntax Guide

### Tables
```dbml
Table users {
  id integer [pk, increment]
  username varchar(50) [unique, not null]
  email varchar(100) [not null]
  is_active boolean [default: true]
  
  Note: 'Application users'
}
```

### Relationships
Define relationships between tables:

```dbml
// Explicit reference
Ref: posts.user_id > users.id [delete: cascade, update: restrict]

// Or inline
Table posts {
  user_id integer [ref: > users.id]
}
```

**Relationship types:**
- `>` Many-to-One
- `<` One-to-Many
- `-` One-to-One

**Actions:**
- `delete: cascade | restrict | set null | set default | no action`
- `update: cascade | restrict | set null | set default | no action`

### Table Groups
Organize related tables visually:

```dbml
TableGroup e_commerce {
  products
  orders
  order_items
  
  note: "Core e-commerce tables"
}
```

**Available colors:** red, blue, green, yellow, orange, purple

### Enums
Define reusable enum types:

```dbml
Enum order_status {
  pending
  processing
  shipped
  delivered
  cancelled
}

Table orders {
  status order_status
}
```

### Indexes
Add indexes to improve query performance:

```dbml
Table users {
  id integer [pk]
  email varchar(100)
  username varchar(50)
  
  indexes {
    email [unique, name: 'unique_email']
    (username, email) [name: 'idx_user_contact']
  }
}
```

### Schemas
Organize tables into database schemas:

```dbml
Table auth.users {
  id integer [pk]
  username varchar
  
  Note: 'schema: auth'
}
```

### Field Settings
Available field attributes:

- `[pk]` or `[primary key]` - Primary key
- `[not null]` - NOT NULL constraint
- `[unique]` - Unique constraint
- `[increment]` - Auto-increment
- `[default: value]` - Default value
- `[note: 'text']` - Column comment
- `[ref: > table.column]` - Foreign key

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

## 💡 Tips & Best Practices

### Organizing Large Schemas
- Use **TableGroups** to organize related tables
- Create **multiple views** to focus on specific parts of your schema
- Use **meaningful table and column names**
- Add **notes** to document complex relationships

### SQL Generation
- Always **test generated SQL** in a development environment first
- Review **foreign key actions** (CASCADE, RESTRICT) carefully
- Check **data type mappings** for your specific database version
- Consider **schema names** for better organization (PostgreSQL, SQL Server)

### DBML Best Practices
- Use **consistent naming conventions** (snake_case or camelCase)
- Always define **primary keys** explicitly
- Add **notes** to document table purposes and field meanings
- Define **relationships explicitly** using `Ref:` blocks to avoid duplicates
- Use **enums** for fields with limited value sets

### Performance
- The extension **auto-saves layout** positions per file
- Large schemas (50+ tables) work best with **custom views**
- Use **format on save** to keep code clean automatically

## 🧪 Testing & Validation Tools

The extension includes built-in testing tools to help you validate database connections before reverse engineering:

### PostgreSQL Connection Tester
Test your PostgreSQL connections with detailed diagnostics:

```bash
# Test connection and get detailed information
node test-postgres-connection.js "postgresql://user:pass@host:5432/db"

# Test and generate DBML (requires manual DBML generation)
node test-postgres-connection.js "postgresql://user:pass@host:5432/db" --generate-dbml
```

**What it tests:**
- ✅ Database connectivity
- ✅ SSL configuration
- ✅ Schema access permissions
- ✅ Available tables and schemas
- ✅ Connection string validation

### SQLite Testing
```bash
# Test reverse engineering from SQLite file
node test-reverse-sqlite.js /path/to/database.db
```

### Included Test Files
- `test-postgres-connection.js` - PostgreSQL connection validator
- `test-reverse-postgres.js` - PostgreSQL reverse engineering test
- `test-reverse-sqlite.js` - SQLite reverse engineering test
- `test-user-dbml.dbml` - Sample DBML file for testing
- `examples/anti-patterns-demo.dbml` - Anti-patterns demonstration

## 🔗 Useful Resources

- [DBML Documentation](https://dbml.dbdiagram.io/docs/)
- [DBML Language Spec](https://dbml.dbdiagram.io/docs/#table-definition)

## 📋 Requirements

- **VS Code** 1.80.0 or higher
- **Node.js** (automatically included with VS Code)

## ⚙️ Extension Settings

This extension works out of the box with sensible defaults:

- **Format on Save**: Enabled by default for DBML files
- **Syntax Highlighting**: Automatic for `.dbml` files
- **Auto-Completion**: Always active

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/anfeh/dbml-diagram-viewer).

## 📜 License

This extension is licensed under the MIT License.

## 🎉 Enjoy!

Happy database modeling! If you find this extension helpful, please consider leaving a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/).

---

**Made with ❤️ for the database design community**
