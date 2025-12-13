# SQL Generation Feature

## Overview

The NOISE DBML extension now includes a powerful SQL generation feature that converts your DBML schema into production-ready SQL scripts for multiple database systems.

## How to Use

### Step 1: Open a DBML File
Open any `.dbml` file in VS Code that contains your database schema.

### Step 2: Generate SQL
You can generate SQL in two ways:

1. **Via Toolbar**: Click the database icon (🗄️) in the editor title bar
2. **Via Command Palette**: 
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "DBML: Generate SQL"
   - Press Enter

### Step 3: Select Dialect
Choose your target database system:
- **PostgreSQL** - Industry standard open-source RDBMS
- **MySQL** - Popular open-source database
- **SQLite** - Lightweight embedded database


### Step 4: Configure Options
Choose whether to include DROP TABLE statements:
- **No**: Only CREATE TABLE statements (recommended for first-time deployment)
- **Yes**: Includes DROP TABLE statements before CREATE (useful for development/testing)

### Step 5: Review Generated SQL
The SQL script will open in a new editor window. You can:
- Copy the SQL to your clipboard
- Save it as a `.sql` file
- Execute it directly in your database management tool

## What's Generated

### Tables
```sql
CREATE TABLE IF NOT EXISTS "users" (
  "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
  "username" VARCHAR(50) NOT NULL UNIQUE,
  "email" VARCHAR(100) NOT NULL UNIQUE,
  "created_at" TIMESTAMP NOT NULL,
  PRIMARY KEY ("id")
);
```

### Foreign Keys
```sql
ALTER TABLE "orders"
  ADD CONSTRAINT "fk_orders_users"
  FOREIGN KEY ("user_id")
  REFERENCES "users" ("id")
  ON DELETE CASCADE;
```

### Comments/Notes
```sql
COMMENT ON TABLE "users" IS 'User accounts table';
COMMENT ON COLUMN "users"."username" IS 'Unique username for login';
```

## Dialect-Specific Features

### PostgreSQL
- Uses `SERIAL` or `GENERATED ALWAYS AS IDENTITY` for auto-increment
- Supports `JSONB`, `UUID`, `TIMESTAMPTZ` types
- Full support for schemas
- Comments via `COMMENT ON` statements

### MySQL
- Uses `AUTO_INCREMENT` for auto-increment
- Boolean types mapped to `TINYINT(1)`
- Backtick identifiers (\`table_name\`)
- Comments via `ALTER TABLE ... COMMENT`

### SQLite
- Simplified data types (INTEGER, TEXT, REAL, BLOB)
- No schema support
- `AUTOINCREMENT` keyword
- Limited constraint support



## Example: Full Workflow

Given this DBML:
```dbml
Table users {
  id integer [pk, increment]
  username varchar(50) [unique, not null]
  email varchar(100) [not null]
  
  Note: 'Application users'
}

Table posts {
  id integer [pk, increment]
  user_id integer [ref: > users.id]
  title varchar(200) [not null]
  content text
}
```

PostgreSQL output:
```sql
-- Generated SQL from DBML
-- Dialect: postgresql

-- Create tables
CREATE TABLE IF NOT EXISTS "users" (
  "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
  "username" VARCHAR(50) NOT NULL UNIQUE,
  "email" VARCHAR(100) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "posts" (
  "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

-- Create foreign key constraints
ALTER TABLE "posts"
  ADD CONSTRAINT "fk_posts_users"
  FOREIGN KEY ("user_id")
  REFERENCES "users" ("id");

-- Add table and column comments
COMMENT ON TABLE "users" IS 'Application users';
```

## Tips

1. **Test in Development First**: Always test generated SQL in a development environment before production
2. **Review Foreign Keys**: Check that ON DELETE/ON UPDATE behaviors match your requirements
3. **Adjust Data Types**: Review generated data types and adjust if needed for your specific use case
4. **Schema Support**: Use PostgreSQL if you need multiple schemas
5. **Version Control**: Save generated SQL files in your version control system

## Troubleshooting

### "Failed to generate SQL: Parse error"
- Your DBML file has syntax errors
- Check the Problems panel for details
- Ensure all table and field names are valid

### Missing Foreign Keys
- Ensure relationships are defined with proper syntax
- Check that referenced tables exist in the schema
- Verify field names match between tables

### Wrong Data Types
- DBML type names are case-insensitive
- Use standard SQL type names in your DBML
- Custom types may not map automatically

## Future Enhancements

Planned features:
- Index generation
- View definitions
- Trigger creation
- Stored procedure scaffolding
- Migration script generation
