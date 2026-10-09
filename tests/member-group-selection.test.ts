import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node test runner loads TypeScript source extensions.
import { memberGroupSelection } from "../lib/member-group-selection.ts";
import type { GroupRole } from "@prisma/client";

test("explicit invalid selections never fall back to global member access", () => {
  const groups = [{ groupId: "a", role: "OPERATOR" as GroupRole, group: { name: "Synthetic A" } }];
  for (const requested of ["b", "", ["a", "b"]]) {
    assert.equal(memberGroupSelection(groups, requested).mode, "denied");
    assert.equal(memberGroupSelection([], requested).mode, "denied");
  }
  assert.equal(memberGroupSelection(groups, undefined).mode, "choose");
  assert.equal(memberGroupSelection([], undefined).mode, "legacy");
  for (const role of ["OWNER", "ADMIN", "OPERATOR"] as GroupRole[]) {
    const result = memberGroupSelection([{ ...groups[0], role }], "a");
    assert.equal(result.mode, "group");
    if (result.mode === "group") assert.equal(result.canEdit, role !== "OPERATOR");
  }
});
