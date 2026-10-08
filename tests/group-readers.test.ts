import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node test runner loads TypeScript source extensions.
import { createGroupReader } from "../lib/group-readers.ts";
// @ts-expect-error Node test runner loads TypeScript source extensions.
import { createGroupAuthorizer } from "../lib/group-authorization.ts";

test("group reads authorize before resource access and deny cross-group and ordinary members", async () => {
  let role: "OWNER" | "ADMIN" | "OPERATOR" | "MEMBER" = "OPERATOR";
  let signedIn = true;
  const queries: string[] = [];
  const read = createGroupReader({
    authorize: createGroupAuthorizer({
      getCurrentUser: async () => signedIn ? { id: "staff" } : null,
      findMembership: async (userId, groupId) => groupId === "a" ? { userId, groupId, role } : null,
    }),
    find: async (groupId: string) => { queries.push(groupId); return [{ id: "synthetic", groupId }]; },
  });
  assert.deepEqual(await read("a"), [{ id: "synthetic", groupId: "a" }]);
  await assert.rejects(read("b"), /FORBIDDEN/);
  role = "MEMBER";
  await assert.rejects(read("a"), /FORBIDDEN/);
  signedIn = false;
  await assert.rejects(read("a"), /AUTH_REQUIRED/);
  assert.deepEqual(queries, ["a"]);
});
