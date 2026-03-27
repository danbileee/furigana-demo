import { type BaseEntity, BaseEntitySchema } from "./base.schema";
import type { FuriganaRow } from "~/lib/db/furigana.db";

const validEntity = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  createdAt: "2026-03-26T12:00:00.000Z",
  updatedAt: "2026-03-26T12:00:00.000Z",
};

describe("BaseEntitySchema", () => {
  it("accepts a valid object with UUID id and ISO datetime strings", () => {
    const result = BaseEntitySchema.parse(validEntity);

    expect(result).toEqual(validEntity);
  });

  it("rejects a non-UUID id", () => {
    expect(() => BaseEntitySchema.parse({ ...validEntity, id: "not-a-uuid" })).toThrow();
  });

  it("rejects a non-ISO createdAt", () => {
    expect(() => BaseEntitySchema.parse({ ...validEntity, createdAt: "2026/03/26" })).toThrow();
  });

  it("rejects a non-ISO updatedAt", () => {
    expect(() => BaseEntitySchema.parse({ ...validEntity, updatedAt: "2026/03/26" })).toThrow();
  });

  it("rejects missing id", () => {
    const { id: _id, ...withoutId } = validEntity;
    expect(() => BaseEntitySchema.parse(withoutId)).toThrow();
  });

  it("rejects missing createdAt", () => {
    const { createdAt: _createdAt, ...withoutCreatedAt } = validEntity;
    expect(() => BaseEntitySchema.parse(withoutCreatedAt)).toThrow();
  });

  it("rejects missing updatedAt", () => {
    const { updatedAt: _updatedAt, ...withoutUpdatedAt } = validEntity;
    expect(() => BaseEntitySchema.parse(withoutUpdatedAt)).toThrow();
  });
});

describe("BaseEntitySchema fields", () => {
  it("contains exactly the expected field keys", () => {
    const keys = Object.keys(BaseEntitySchema.shape);

    expect(keys).toEqual(["id", "createdAt", "updatedAt"]);
  });
});

describe("BaseEntity type alignment", () => {
  it("keeps base fields bidirectionally assignable with Drizzle row base fields", () => {
    const _drizzleToZod = {} as Pick<
      FuriganaRow,
      "id" | "createdAt" | "updatedAt"
    > satisfies BaseEntity;
    const _zodToDrizzle = {} as BaseEntity satisfies Pick<
      FuriganaRow,
      "id" | "createdAt" | "updatedAt"
    >;

    expect(_drizzleToZod).toBeDefined();
    expect(_zodToDrizzle).toBeDefined();
  });
});
