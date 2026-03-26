import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, drizzleMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ mockClient: true })),
  drizzleMock: vi.fn(() => ({ mockDb: true })),
}));

vi.mock("@libsql/client", () => ({
  createClient: createClientMock,
}));

vi.mock("drizzle-orm/libsql", () => ({
  drizzle: drizzleMock,
}));

describe("db client startup validation", () => {
  const originalUrl = process.env["TURSO_DATABASE_URL"];
  const originalAuthToken = process.env["TURSO_AUTH_TOKEN"];

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    drizzleMock.mockClear();
  });

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env["TURSO_DATABASE_URL"] = originalUrl;
    } else {
      delete process.env["TURSO_DATABASE_URL"];
    }

    if (originalAuthToken !== undefined) {
      process.env["TURSO_AUTH_TOKEN"] = originalAuthToken;
    } else {
      delete process.env["TURSO_AUTH_TOKEN"];
    }
  });

  it("throws when TURSO_DATABASE_URL is undefined", async () => {
    delete process.env["TURSO_DATABASE_URL"];
    process.env["TURSO_AUTH_TOKEN"] = "test-token";

    await expect(import("~/lib/db/client")).rejects.toThrow("TURSO_DATABASE_URL");
  });

  it("throws when TURSO_DATABASE_URL is an empty string", async () => {
    process.env["TURSO_DATABASE_URL"] = "";
    process.env["TURSO_AUTH_TOKEN"] = "test-token";

    await expect(import("~/lib/db/client")).rejects.toThrow("TURSO_DATABASE_URL");
  });

  it("throws when TURSO_DATABASE_URL is whitespace only", async () => {
    process.env["TURSO_DATABASE_URL"] = "   ";
    process.env["TURSO_AUTH_TOKEN"] = "test-token";

    await expect(import("~/lib/db/client")).rejects.toThrow("TURSO_DATABASE_URL");
  });

  it("throws when TURSO_AUTH_TOKEN is undefined for libsql URLs", async () => {
    process.env["TURSO_DATABASE_URL"] = "libsql://test.turso.io";
    delete process.env["TURSO_AUTH_TOKEN"];

    await expect(import("~/lib/db/client")).rejects.toThrow("TURSO_AUTH_TOKEN");
  });

  it("throws when TURSO_AUTH_TOKEN is undefined for non-file URLs", async () => {
    process.env["TURSO_DATABASE_URL"] = "https://example.turso.io";
    delete process.env["TURSO_AUTH_TOKEN"];

    await expect(import("~/lib/db/client")).rejects.toThrow("TURSO_AUTH_TOKEN");
  });

  it("does not throw when TURSO_AUTH_TOKEN is undefined for file URLs", async () => {
    process.env["TURSO_DATABASE_URL"] = "file:local.db";
    delete process.env["TURSO_AUTH_TOKEN"];

    const { db } = await import("~/lib/db/client");

    expect(db).toBeDefined();
  });

  it("does not throw when TURSO_AUTH_TOKEN is undefined for file::memory:", async () => {
    process.env["TURSO_DATABASE_URL"] = "file::memory:";
    delete process.env["TURSO_AUTH_TOKEN"];

    const { db } = await import("~/lib/db/client");

    expect(db).toBeDefined();
  });

  it("does not throw when TURSO_AUTH_TOKEN is an empty string for file URLs", async () => {
    process.env["TURSO_DATABASE_URL"] = "file:local.db";
    process.env["TURSO_AUTH_TOKEN"] = "";

    const { db } = await import("~/lib/db/client");

    expect(db).toBeDefined();
  });

  it("exports db when both env vars are valid", async () => {
    process.env["TURSO_DATABASE_URL"] = "libsql://test.turso.io";
    process.env["TURSO_AUTH_TOKEN"] = "test-token";

    const { db } = await import("~/lib/db/client");

    expect(db).toBeDefined();
  });

  it("calls createClient once with env-derived credentials", async () => {
    process.env["TURSO_DATABASE_URL"] = "libsql://test.turso.io";
    process.env["TURSO_AUTH_TOKEN"] = "test-token";

    await import("~/lib/db/client");

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith({
      url: "libsql://test.turso.io",
      authToken: "test-token",
    });
  });
});
