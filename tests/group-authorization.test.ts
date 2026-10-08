import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript runner requires the source extension.
import { createGroupAuthorizer } from "../lib/group-authorization.ts";
import type { GroupAuthorizationDependencies } from "../lib/group-authorization";
import type { GroupRole } from "@prisma/client";

const roles: GroupRole[] = ["OWNER", "ADMIN", "OPERATOR", "MEMBER"];

test("all sixteen group-role combinations follow the privilege hierarchy", async () => {
  for (const [actualIndex, role] of roles.entries()) {
    const authorize = createGroupAuthorizer({
      getCurrentUser: async () => ({ id: "user-a" }),
      findMembership: async (userId: string, groupId: string) => ({ userId, groupId, role }),
    });
    for (const [requiredIndex, required] of roles.entries()) {
      if (actualIndex <= requiredIndex) {
        assert.deepEqual(await authorize("group-a", required), {
          userId: "user-a", groupId: "group-a", role,
        });
      } else {
        await assert.rejects(authorize("group-a", required), /FORBIDDEN/);
      }
    }
  }
});

test("anonymous access never looks up membership", async () => {
  const authorize = createGroupAuthorizer({
    getCurrentUser: async () => null,
    findMembership: async () => { throw new Error("unexpected lookup"); },
  });
  await assert.rejects(authorize("group-a", "MEMBER"), /AUTH_REQUIRED/);
});

test("global admin has no bypass and roles differ between groups", async () => {
  const authorize = createGroupAuthorizer({
    getCurrentUser: async () => ({ id: "user-a", role: "ADMIN" }),
    findMembership: async (userId: string, groupId: string) => {
      if (groupId === "group-a") return { userId, groupId, role: "OWNER" };
      if (groupId === "group-b") return { userId, groupId, role: "OPERATOR" };
      return null;
    },
  });
  await authorize("group-a", "OWNER");
  await authorize("group-b", "OPERATOR");
  await assert.rejects(authorize("group-b", "ADMIN"), /FORBIDDEN/);
  await assert.rejects(authorize("group-c", "MEMBER"), /FORBIDDEN/);
});

test("revoked membership is denied on the next call", async () => {
  let exists = true;
  const authorize = createGroupAuthorizer({
    getCurrentUser: async () => ({ id: "user-a" }),
    findMembership: async (userId: string, groupId: string) => exists ? { userId, groupId, role: "OWNER" } : null,
  });
  await authorize("group-a", "OWNER");
  exists = false;
  await assert.rejects(authorize("group-a", "MEMBER"), /FORBIDDEN/);
});

test("invalid context and mismatched lookup results fail closed", async () => {
  for (const mismatch of [{ userId: "other", groupId: "group-a" }, { userId: "user-a", groupId: "other" }]) {
    const authorize = createGroupAuthorizer({
      getCurrentUser: async () => ({ id: "user-a" }),
      findMembership: async () => ({ ...mismatch, role: "OWNER" }),
    });
    await assert.rejects(authorize("group-a", "MEMBER"), /FORBIDDEN/);
  }
  const dependencies: GroupAuthorizationDependencies = {
    getCurrentUser: async () => ({ id: "user-a" }),
    findMembership: async () => { throw new Error("unexpected lookup"); },
  };
  const authorize = createGroupAuthorizer(dependencies);
  for (const id of ["", " ", " group-a", null, undefined, 42, {}, []]) {
    await assert.rejects(authorize(id as string, "MEMBER"), /^Error: FORBIDDEN$/);
  }
  for (const role of ["UNKNOWN", "toString", "constructor", "__proto__", null, {}, []]) {
    await assert.rejects(authorize("group-a", role as GroupRole), /^Error: FORBIDDEN$/);
  }
});

test("database errors propagate without granting access", async () => {
  const authorize = createGroupAuthorizer({
    getCurrentUser: async () => ({ id: "user-a" }),
    findMembership: async () => { throw new Error("database unavailable"); },
  });
  await assert.rejects(authorize("group-a", "MEMBER"), /database unavailable/);
});
