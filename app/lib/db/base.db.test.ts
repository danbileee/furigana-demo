import { getTableColumns } from "drizzle-orm";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./base.db";

const baseTestTable = sqliteTable("_base_test", baseColumns);

describe("baseColumns structure", () => {
  it("maps camelCase keys to expected SQL column names", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.id.name).toBe("id");
    expect(columns.createdAt.name).toBe("created_at");
    expect(columns.updatedAt.name).toBe("updated_at");
  });

  it("stores id as text (uuid format alignment with Zod)", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.id.getSQLType()).toBe("text");
  });

  it("stores createdAt and updatedAt as text (date format alignment with Zod)", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.createdAt.getSQLType()).toBe("text");
    expect(columns.updatedAt.getSQLType()).toBe("text");
  });

  it("defines id as primary key", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.id.primary).toBe(true);
  });

  it("marks createdAt and updatedAt as NOT NULL", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
  });

  it("wires $onUpdateFn on updatedAt returning ISO string", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.updatedAt.onUpdateFn).toBeTypeOf("function");
    expect(columns.updatedAt.onUpdateFn?.()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("does NOT wire $onUpdateFn on createdAt", () => {
    const columns = getTableColumns(baseTestTable);

    expect(columns.createdAt.onUpdateFn).toBeUndefined();
  });
});
