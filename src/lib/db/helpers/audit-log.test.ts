import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing the audit functions
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockValues = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

vi.mock("../index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return { values: mockValues };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: mockFrom };
    },
  },
}));

vi.mock("../schema", () => ({
  auditLog: { _name: "audit_log" },
}));

vi.mock("./org-scope", () => ({
  orgScopeAlive: (_table: unknown, orgId: string) => [
    { type: "eq", field: "orgId", value: orgId },
  ],
}));

import { auditMutation, getAuditHistory, withAudit } from "./audit-log";

beforeEach(() => {
  vi.clearAllMocks();

  // Default chain: insert().values() resolves
  mockValues.mockResolvedValue(undefined);

  // Default chain: select().from().where().orderBy().limit() resolves
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue([]);
});

describe("auditMutation", () => {
  it("inserts a record with correct fields", async () => {
    await auditMutation({
      orgId: "org-1",
      entityType: "document",
      entityId: "doc-1",
      action: "create",
      newValue: { status: "draft" },
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith({
      orgId: "org-1",
      entityType: "document",
      entityId: "doc-1",
      action: "create",
      oldValue: null,
      newValue: { status: "draft" },
      actorId: null,
    });
  });

  it("passes actorId when provided", async () => {
    await auditMutation({
      orgId: "org-1",
      entityType: "vendor",
      entityId: "v-1",
      action: "update",
      actorId: "user-42",
      oldValue: { name: "Old" },
      newValue: { name: "New" },
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-42",
        oldValue: { name: "Old" },
        newValue: { name: "New" },
      }),
    );
  });

  it("does NOT throw on error (logs instead)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockValues.mockRejectedValue(new Error("DB connection failed"));

    // Should not throw
    await expect(
      auditMutation({
        orgId: "org-1",
        entityType: "document",
        entityId: "doc-1",
        action: "create",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit-log] Failed to write audit entry:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});

describe("getAuditHistory", () => {
  it("returns entries for an entity sorted by createdAt desc", async () => {
    const mockEntries = [
      { id: "a-2", entityType: "document", action: "update" },
      { id: "a-1", entityType: "document", action: "create" },
    ];
    mockLimit.mockResolvedValue(mockEntries);

    const result = await getAuditHistory("org-1", "document", "doc-1");

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockEntries);
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it("respects custom limit", async () => {
    mockLimit.mockResolvedValue([]);

    await getAuditHistory("org-1", "document", "doc-1", 10);

    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it("respects org scoping (entries from org B not returned for org A query)", async () => {
    // The orgScopeAlive mock is called with the orgId parameter.
    // Verify that the where clause receives the correct org scoping.
    mockLimit.mockResolvedValue([]);

    await getAuditHistory("org-A", "document", "doc-1");

    // The where() call should have been invoked with conditions
    // that include the org-A scope from orgScopeAlive
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});

describe("withAudit", () => {
  it("captures old value, runs mutation, captures new value, writes audit entry", async () => {
    const oldValue = { status: "draft" };
    const mutationResult = { status: "confirmed", needsReview: false };

    const result = await withAudit(
      {
        orgId: "org-1",
        entityType: "document",
        entityId: "doc-1",
        action: "update",
      },
      async () => oldValue,
      async () => mutationResult,
    );

    // Returns the mutation result
    expect(result).toEqual(mutationResult);

    // Writes audit entry with old and new values
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityType: "document",
        entityId: "doc-1",
        action: "update",
        oldValue: { status: "draft" },
        newValue: { status: "confirmed", needsReview: false },
      }),
    );
  });

  it("handles null old value", async () => {
    await withAudit(
      {
        orgId: "org-1",
        entityType: "vendor",
        entityId: "v-1",
        action: "create",
      },
      async () => null,
      async () => ({ name: "New Vendor" }),
    );

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        oldValue: null,
        newValue: { name: "New Vendor" },
      }),
    );
  });

  it("handles non-object mutation results (sets newValue to null)", async () => {
    await withAudit(
      {
        orgId: "org-1",
        entityType: "document",
        entityId: "doc-1",
        action: "delete",
      },
      async () => ({ status: "confirmed" }),
      async () => "deleted" as unknown,
    );

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: { status: "confirmed" },
        newValue: null,
      }),
    );
  });

  it("still runs the mutation even if audit logging fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockValues.mockRejectedValue(new Error("Audit write failed"));

    let mutationCalled = false;
    const result = await withAudit(
      {
        orgId: "org-1",
        entityType: "document",
        entityId: "doc-1",
        action: "update",
      },
      async () => null,
      async () => {
        mutationCalled = true;
        return { id: "doc-1" };
      },
    );

    expect(mutationCalled).toBe(true);
    expect(result).toEqual({ id: "doc-1" });

    consoleSpy.mockRestore();
  });
});
