# Noise DBML

[![Version](https://img.shields.io/visual-studio-marketplace/v/AndrsFelipeMurillo.noise-dbml?style=flat-square&color=007acc)](https://marketplace.visualstudio.com/items?itemName=AndrsFelipeMurillo.noise-dbml)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/AndrsFelipeMurillo.noise-dbml?style=flat-square&color=success)](https://marketplace.visualstudio.com/items?itemName=AndrsFelipeMurillo.noise-dbml)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/AndrsFelipeMurillo.noise-dbml?style=flat-square&color=orange)](https://marketplace.visualstudio.com/items?itemName=AndrsFelipeMurillo.noise-dbml)
[![License](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/anfeh/dbml-diagram-viewer/blob/master/LICENSE)

**Professional DBML tooling for VS Code.** Design, visualize, and document your database schemas with an enterprise-grade workflow.

Noise DBML transforms VS Code into a powerful database design studio. Go from concept to production-ready SQL with interactive diagrams, intelligent code assistance, and automated best-practice checks.

---

## ⚡ Key Features

### 📊 Interactive Schema Visualization
Turn your code into architectural clarity.
*   **Live Preview**: Real-time rendering of your schema as you type.
*   **Optimized Layouts**: Smart auto-layout with persistence—drag tables once, and they stay there.
*   **Theme Adaptive**: Native support for VS Code's light, dark, and high-contrast themes.
*   **Diagram Export**: High-resolution PNG export for technical documentation.

### 🛡️ Intelligent Anti-Pattern Detection
Catch design flaws before they reach production. The built-in analyzer proactively scans your schema for:
*   Missing Primary Keys & Indexes
*   Circular Dependencies
*   Excessive Nullability (>50% columns)
*   Table Bloat (>20 columns)
*   SQL Reserved Keyword conflicts
*   *...and more industry-standard best practices.*

### 🔄 Multi-Dialect SQL Generation
Production-ready DDL generation for major database engines.
*   **Supported Dialects**: PostgreSQL, MySQL, SQLite.
*   **Advanced Features**: Handles JSONB, Enums, UUIDs, and Schema namespaces (PostgreSQL).
*   **Safe Migrations**: Optional `IF NOT EXISTS` and `DROP` guardrails for development flexibility.

### 🔌 Seamless Reverse Engineering
Import your existing infrastructure in seconds.
*   **Connect & Import**: Pull schemas directly from live databases (PostgreSQL, MySQL, SQLite/SQLite Cloud).
*   **Smart Detection**: Automatically extracts tables, relations (FKs), indexes, and type constraints.
*   **Secure**: SSL/TLS support for cloud-hosted databases (AWS RDS, Supabase, Heroku).

---

## 🚀 Quick Start

### 1. Design
Create a `.dbml` file. Noise DBML provides rich **IntelliSense**, **Snippets**, and **Syntax Highlighting**.

```dbml
// Use 'table' + Tab to snippet
Table users {
  id integer [pk, increment]
  email varchar [unique, not null]
  created_at timestamp [default: `now()`]
}

Table posts {
  id integer [pk, increment]
  user_id integer [ref: > users.id] // One-to-Many
  title varchar [not null]
}
```

### 2. Visualize
Open the Command Palette (`Ctrl/Cmd + Shift + P`) and run:
> `Noise DBML: Open Preview`

### 3. Build
Generate your SQL migration script:
> `Noise DBML: Generate SQL`

---

## 📦 Supported Databases

| Database | Import | Export | Notes |
| :--- | :---: | :---: | :--- |
| **PostgreSQL** | ✅ | ✅ | Full schema & SSL support |
| **MySQL** | ✅ | ✅ | Supports MariaDB compatible drivers |
| **SQLite** | ✅ | ✅ | Local files (`.db`) & SQLite Cloud |
| **SQL Server** | ❌ | ❌ | *Coming soon* |

---

## 🛠️ Power User Commands

| Command | ID | Description |
| :--- | :--- | :--- |
| **Open Preview** | `noise-dbml.openPreview` | Opens the interactive visualizer side-by-side. |
| **Generate SQL** | `noise-dbml.generateSql` | Transpiles DBML to SQL DDL. |
| **Audit Schema** | `noise-dbml.detectAntiPatterns` | Runs the static analysis engine. |
| **Import Database** | `noise-dbml.reverseEngineerDb` | Connects to a DB and generates DBML. |

---

## ⚙️ Configuration

Customize the extension behavior in your VS Code `settings.json`:

```json
{
  "[dbml]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "AndrsFelipeMurillo.noise-dbml"
  }
}
```

---

## 🤝 Contributing & Support

This project is open source. If you find value in Noise DBML, please consider staring the repository or contributing.

*   **Repository**: [github.com/anfeh/dbml-diagram-viewer](https://github.com/anfeh/dbml-diagram-viewer)
*   **Issues**: [Report a Bug](https://github.com/anfeh/dbml-diagram-viewer/issues)
*   **License**: GPLv3

---
*Built with precision for the developer community.*
