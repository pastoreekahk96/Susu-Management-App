"use client";

import { useEffect, useRef, useState } from "react";

export default function GroupCompleteWeekButton({ groupId, weekId, reason, onLockChange }: {
  groupId: string; weekId: string; reason: string | null; onLockChange: (locked: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => { setReady(true); }, []);

  async function complete() {
    if (!ready || reason || pending.current || needsReload) return;
    if (!window.confirm("Complete this week? This will lock contribution editing and make the week eligible for payout.")) return;
    pending.current = true; setBusy(true); setError(""); onLockChange(true);
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/weeks/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.error === "string" ? data.error : "Unable to complete the week.");
        setNeedsReload(true); return;
      }
      if (data?.id !== weekId || data.status !== "ELIGIBLE") throw new Error("UNCONFIRMED_COMPLETION");
      window.location.reload();
    } catch {
      setError("Could not confirm week completion. Reload before trying again.");
      setNeedsReload(true);
    } finally {
      // Keep contributions locked until a fresh server read confirms the outcome.
      setBusy(false);
    }
  }

  return <section className="card" data-completion-ready={ready ? "true" : "false"}>
    <h2>Complete week</h2>
    <p>Completion locks contribution editing and makes this week eligible for payout.</p>
    {reason ? <p className="muted">{reason}</p> : null}
    <button className="button" type="button" disabled={!ready || !!reason || busy || pending.current || needsReload} onClick={complete}>
      {busy ? "Completing…" : "Complete week"}
    </button>
    {error ? <p role="alert">{error}</p> : null}
    {needsReload ? <button className="button secondary" type="button" onClick={() => window.location.reload()}>Reload week</button> : null}
  </section>;
}
