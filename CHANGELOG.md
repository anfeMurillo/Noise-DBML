# Change Log

All notable changes to the "noise-dbml" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- **Anti-Pattern Detection**: New feature to automatically detect database design issues
  - Detects tables without primary keys
  - Identifies excessive nullable fields (>50%)
  - Warns about SQL reserved keywords in names
  - Checks for invalid naming conventions
  - Flags tables with too many columns (>20)
  - Detects circular table dependencies
  - Suggests indexes for foreign key fields
  - Provides detailed reports with explanations and recommendations
  - Accessible via editor toolbar icon or command palette
- Added ANTI_PATTERNS.md documentation file with comprehensive guide
- Added examples/anti-patterns-demo.dbml with example anti-patterns

- **SQL Generation**: New feature to convert DBML schemas to SQL scripts
  - Support for multiple SQL dialects: PostgreSQL, MySQL, SQLite, and SQL Server
  - Automatic data type mapping for each dialect
  - Foreign key constraints with ON DELETE/ON UPDATE actions
  - Table and column comments (where supported)
  - Optional DROP TABLE statements
  - Accessible via editor toolbar icon or command palette
- Added SQL_GENERATION.md documentation file with comprehensive usage guide

### Previous Updates
- Added default configuration to enable format on save for DBML files.
- Added DBML document formatter for aligning table columns.
- Initial release