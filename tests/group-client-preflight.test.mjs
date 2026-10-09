import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyGroupClient } from "../scripts/verify-group-client.mjs";

test("client preflight rejects old generated models before database writes", () => {
  const models = ["Group", "GroupMembership", "Member", "Cycle", "Session", "LoginAttempt"].map(name => ({ name, fields: [{ name: "groupId" }] }));
  assert.doesNotThrow(() => verifyGroupClient(models));
  assert.throws(() => verifyGroupClient(undefined), /STALE_PRISMA/);
  for (const name of ["Group", "GroupMembership", "Member", "Cycle", "Session", "LoginAttempt"]) {
    assert.throws(() => verifyGroupClient(models.filter(model => model.name !== name)), /STALE_PRISMA/);
  }
  for (const name of ["Member", "Cycle"]) {
    assert.throws(() => verifyGroupClient(models.map(model => model.name === name ? { ...model, fields: [] } : model)), /STALE_PRISMA/);
  }
});
