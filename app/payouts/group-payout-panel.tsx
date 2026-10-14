"use client";

import { useEffect, useRef, useState } from "react";
import { groupPayoutConfirmation, isConfirmedGroupPayout, type ConfirmedGroupPayout, type GroupPayoutOptions } from "../../lib/group-payout-ui";

export default function GroupPayoutPanel({ groupId, options }: { groupId: string; options: GroupPayoutOptions }) {
  const [ready, setReady] = useState(false);
  const [weekId, setWeekId] = useState(options.weeks[0]?.id ?? "");
  const [method, setMethod] = useState<"RANDOM" | "MANUAL">("RANDOM");
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConfirmedGroupPayout | null>(null);
  const pending = useRef(false);
  useEffect(() => { setReady(true); }, []);
  const week = options.weeks.find(candidate => candidate.id === weekId);
  const member = options.members.find(candidate => candidate.id === memberId);
  const totalHands = options.members.reduce((sum, candidate) => sum + candidate.pendingHands, 0);
  const locked = !ready || busy || needsReload;
  const canSubmit = !locked && !!week && totalHands > 0 && (method === "RANDOM" ||
    (!!member && member.pendingHands > 0 && reason.trim().length > 0 && reason.trim().length <= 500));

  async function submit() {
    if (!canSubmit || !week || pending.current) return;
    if (!window.confirm(groupPayoutConfirmation(week, method, member, reason))) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/payouts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ weekId: week.id, method, ...(method === "MANUAL" ? { memberId, reason: reason.trim() } : {}) }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data ? data.error : null;
        setError(typeof message === "string" ? message : "Unable to confirm payout selection. Reload before trying again.");
      } else {
        if (!isConfirmedGroupPayout(data, week, method, options.members, memberId, reason)) throw new Error("UNCONFIRMED_PAYOUT");
        setResult(data);
      }
    } catch {
      setError("Could not confirm payout selection. Reload before trying again.");
    } finally {
      // Never permit a second draw from stale options after any submitted request.
      setNeedsReload(true); setBusy(false);
    }
  }

  return <section className="card payout-panel" data-payout-ready={ready ? "true" : "false"}>
    <div className="section-heading"><div><h2>Group weekly payout</h2>
      <p className="muted">Select one remaining hand for one eligible week. Cash collection is confirmed separately.</p></div>
      <span className="badge">{method}</span></div>
    <details><summary>Remaining hands: {totalHands}</summary>
      <table><caption>Frozen members and remaining hands</caption><thead><tr><th scope="col">Member</th><th scope="col">Remaining hands</th></tr></thead>
        <tbody>{options.members.map(candidate => <tr key={candidate.id} data-payout-member={candidate.id}>
          <th scope="row">{candidate.name}</th><td>{candidate.pendingHands}</td></tr>)}</tbody></table>
    </details>
    {!options.weeks.length ? <p className="rule">No eligible payout week is available. Complete fully paid weeks after Sunday ends.</p>
      : totalHands === 0 ? <p className="rule">No remaining pending hands are available.</p>
      : <>
        <div className="form-grid">
          <label><span>Eligible week</span><select value={weekId} disabled={locked} onChange={event => setWeekId(event.target.value)}>
            {options.weeks.map(candidate => <option key={candidate.id} value={candidate.id}>Week #{candidate.weekNumber} · {candidate.amount.toLocaleString()} LD</option>)}
          </select></label>
          <label><span>Selection method</span><select value={method} disabled={locked} onChange={event => {
            setMethod(event.target.value as "RANDOM" | "MANUAL"); setMemberId(""); setReason("");
          }}><option value="RANDOM">Random draw</option><option value="MANUAL">Manual selection</option></select></label>
        </div>
        {week ? <p className="muted">Week #{week.weekNumber}: {week.startDate} – {week.endDate} · {week.amount.toLocaleString()} LD</p> : null}
        {method === "MANUAL" ? <div className="form-grid">
          <label><span>Member</span><select value={memberId} disabled={locked} onChange={event => setMemberId(event.target.value)}>
            <option value="">Select a member</option>{options.members.map(candidate => <option key={candidate.id} value={candidate.id} disabled={candidate.pendingHands === 0}>
              {candidate.name} · {candidate.pendingHands} remaining {candidate.pendingHands === 1 ? "hand" : "hands"}</option>)}
          </select></label>
          <label><span>Reason</span><textarea value={reason} maxLength={500} disabled={locked} onChange={event => setReason(event.target.value)} /></label>
        </div> : <p className="rule">The server draws one individual hand from the remaining hands.</p>}
        <button className="button" type="button" disabled={!canSubmit} onClick={submit}>
          {busy ? "Recording selection…" : method === "RANDOM" ? "Run random draw" : "Record manual payout"}
        </button>
      </>}
    {error ? <p role="alert" className="error">{error}</p> : null}
    {result ? <section role="status"><h3>Payout selection recorded</h3>
      <p>Week #{result.weekNumber}: {result.memberName}, hand #{result.handNumber}, {result.amount.toLocaleString()} LD.</p>
      <p>Cash collection has not been confirmed.</p><p>Reload to refresh remaining hand counts.</p></section> : null}
    {needsReload ? <button className="button secondary" type="button" onClick={() => window.location.reload()}>Reload payout options</button> : null}
  </section>;
}
