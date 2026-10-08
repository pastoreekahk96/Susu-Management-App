import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript runner requires the source extension.
import { createSessionReader } from "../lib/session-reader.ts";

const now = new Date("2026-10-08T20:00:00Z");
const user = { id: "synthetic-user", role: "ADMIN" };

test("missing cookie does not query the database", async () => {
  const read = createSessionReader({
    getToken: async () => undefined,
    findSession: async () => { throw new Error("unexpected lookup"); },
  });
  assert.equal(await read(), null);
});

test("stale cookies and expired sessions return anonymous without mutation", async () => {
  for (const expiresAt of [null, new Date(now.getTime() - 1), now, new Date(NaN)]) {
    const read = createSessionReader({
      getToken: async () => "synthetic-token",
      findSession: async (token: string) => {
        assert.equal(token, "synthetic-token");
        return expiresAt ? { expiresAt, user } : null;
      },
      now: () => now,
    });
    assert.equal(await read(), null);
  }
});

test("valid sessions return identity and revocation applies on the next read", async () => {
  let exists = true;
  const read = createSessionReader({
    getToken: async () => "synthetic-token",
    findSession: async () => exists ? { expiresAt: new Date(now.getTime() + 1), user } : null,
    now: () => now,
  });
  assert.deepEqual(await read(), user);
  exists = false;
  assert.equal(await read(), null);
});

test("session database failures propagate without granting identity", async () => {
  const read = createSessionReader({
    getToken: async () => "synthetic-token",
    findSession: async () => { throw new Error("database unavailable"); },
  });
  await assert.rejects(read(), /database unavailable/);
});
