# Migration Conventions

Database migrations using drizzle-kit for Turso (SQLite-based).

## Creating a New Migration

### Step 1: Ask for a Migration Name

**Always ask for a descriptive migration name before generating.** Never use auto-generated names like `0001_gorgeous_multiple_man`.

### Step 2: Run db:generate with Name

Use the convention: **snake_case**, descriptive of the change. But be careful not to describe too long, but just be simple and clear.

```bash
pnpm db:generate update_furigana_columns
# Generates: drizzle/XXXX_update_furigana_columns.sql
```

Examples:

- `create_furiganas_table`
- `update_furiganas_column`
- `apply_base_schema`

### Step 3: Review and Migrate

After generating, apply the migration and verify:

```bash
pnpm db:migrate           # Apply to database
pnpm test                 # Verify migration test guard passes
```

The migration test (`drizzle/migration.test.ts`) validates:

- SQL files are not corrupted
- Required columns exist
- Cursor index is correctly ordered
- No regression bugs are introduced

---

## SQLite Table-Rebuild Pattern

SQLite has limitations: you cannot add a column with constraints, defaults, or ordering requirements directly. Instead, use the **table-rebuild pattern**:

1. Create a new table with the desired schema: `CREATE TABLE __new_table AS ...`
2. Copy data from the old table: `INSERT INTO __new_table SELECT ... FROM old_table`
3. Drop the old table: `DROP TABLE old_table`
4. Rename the new table: `ALTER TABLE __new_table RENAME TO old_table`
5. Recreate indexes and triggers

---

## Constraints

- **Dialect**: `turso` (LibSQL/SQLite-compatible)
- **Schema source**: `app/lib/db/schema.ts` — edit the TypeScript schema, then run `pnpm db:generate`
- **Migration storage**: `drizzle/` directory (checked into git)
- **Env vars**: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (local dev uses `file:local.db` fallback)

---

## Testing Migrations

Run the migration test to ensure integrity:

```bash
pnpm test drizzle/migration.test.ts
```

The test guards against:

- Missing or corrupted SQL files
- Missing columns in the `furiganas` table
- Broken cursor index ordering
- Regression of previous bugs (e.g. `$1` placeholder in `WHERE` clauses)
