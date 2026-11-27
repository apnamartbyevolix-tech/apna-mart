import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { MySqlTable, getTableConfig as mysqlConfig } from "drizzle-orm/mysql-core";
import { PgTable, getTableConfig as pgConfig } from "drizzle-orm/pg-core";
import * as original from "../../drizzle/schema.mysql";
import * as candidate from "../../drizzle/postgres/schema";

const sourceTables = Object.entries(original).filter(([, value]) => is(value, MySqlTable));
describe("PostgreSQL schema migration parity", () => {
  it("preserves all 31 existing tables", () => {
    expect(sourceTables).toHaveLength(31);
    expect(Object.values(candidate).filter(value => is(value, PgTable))).toHaveLength(31);
  });
  for (const [name, table] of sourceTables) {
    it(`preserves ${name} columns, identity and relational constraints`, () => {
      const before = mysqlConfig(table as MySqlTable);
      const after = pgConfig(candidate[name as keyof typeof candidate] as PgTable);
      expect(after.name).toBe(before.name);
      const columns = (config: typeof before | typeof after) => config.columns.map(c => ({
        name: c.name, notNull: c.notNull, primary: c.primary, unique: c.isUnique,
        enumValues: c.enumValues, hasDefault: c.hasDefault,
      }));
      const additive = name === "products" ? ["taxMeta"] : name === "orderItems" ? ["taxSnapshot"] : [];
      expect(columns(after).filter(column => !additive.includes(column.name))).toEqual(columns(before));
      expect(after.columns.filter(column => additive.includes(column.name)).map(column => ({ name: column.name, sqlType: column.getSQLType(), nullable: !column.notNull })))
        .toEqual(additive.map(name => ({ name, sqlType: "json", nullable: true })));
      expect(after.indexes.map(i => ({ name: i.config.name, unique: i.config.unique })))
        .toEqual(before.indexes.map(i => ({ name: i.config.name, unique: i.config.unique })));
      expect(after.foreignKeys.map(f => f.reference().columns.map(c => c.name)))
        .toEqual(before.foreignKeys.map(f => f.reference().columns.map(c => c.name)));
      expect(after.primaryKeys.map(k => k.columns.map(c => c.name)))
        .toEqual(before.primaryKeys.map(k => k.columns.map(c => c.name)));
    });
  }
});
