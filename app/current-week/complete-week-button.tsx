"use client";

import { useState } from "react";

export default function CompleteWeekButton({ weekId }: { weekId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function completeWeek() {
    if (!window.confirm("Complete this week? This will lock contribution editing and make the week eligible for payout.")) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/weeks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Unable to complete the week.");
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="button" type="button" onClick={completeWeek} disabled={busy}>
        {busy ? "Completing…" : "Complete week"}
      </button>
      {error ? <p className="muted" role="alert">{error}</p> : null}
    </div>
  );
}
