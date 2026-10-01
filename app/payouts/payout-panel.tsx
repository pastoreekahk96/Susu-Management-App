"use client";

import { useEffect, useState } from "react";

type EligibleWeek = {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  amount: number;
};

type Member = {
  id: string;
  name: string;
  pendingHands: number;
};

type PayoutOptions = {
  weeks: EligibleWeek[];
  members: Member[];
};

export default function PayoutPanel() {
  const [options, setOptions] = useState<PayoutOptions>({ weeks: [], members: [] });
  const [loading, setLoading] = useState(true);
  const [weekId, setWeekId] = useState("");
  const [method, setMethod] = useState<"RANDOM" | "MANUAL">("RANDOM");
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weeks = options.weeks;
  const members = options.members;
  const selectedWeek = weeks.find((week) => week.id === weekId);
  const eligibleMembers = members.filter((member) => member.pendingHands > 0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/payouts", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load payout options.");
        return data as PayoutOptions;
      })
      .then((data) => {
        if (!cancelled) {
          setOptions(data);
          setWeekId(data.weeks[0]?.id ?? "");
          setLoading(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load payout options.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (!weekId) return;

    const selectedMember = members.find((member) => member.id === memberId);
    const confirmationMessage =
      method === "MANUAL"
        ? [
            `Confirm manual payout for Week #${selectedWeek?.weekNumber ?? "?"}?`,
            `Member: ${selectedMember?.name ?? "Unknown member"}`,
            "Exactly one pending hand will be paid.",
            `Amount: ${selectedWeek?.amount.toLocaleString() ?? "0"} LD`,
            `Reason: ${reason.trim()}`,
            "",
            "This action permanently records the payout and cannot be undone.",
          ].join("\\n")
        : [
            `Confirm random payout for Week #${selectedWeek?.weekNumber ?? "?"}?`,
            "Exactly one remaining pending hand will be selected.",
            `Amount: ${selectedWeek?.amount.toLocaleString() ?? "0"} LD`,
            "",
            "This action permanently records the payout and cannot be undone.",
          ].join("\\n");

    if (!window.confirm(confirmationMessage)) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          method,
          ...(method === "MANUAL"
            ? { memberId, reason: reason.trim() }
            : {}),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Unable to record the payout.");
        return;
      }

      setMessage(
        `Week #${data.weekNumber ?? selectedWeek?.weekNumber} paid: ${data.memberName}, hand #${data.handNumber}, ${data.amount.toLocaleString()} LD.`
      );
      window.location.reload();
    } catch {
      setError("The payout could not be saved. Please check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    Boolean(weekId) &&
    !submitting &&
    (method === "RANDOM" ||
      (Boolean(memberId) && reason.trim().length > 0 && reason.trim().length <= 500));

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>Weekly payout</h2>
          <p className="muted">
            One eligible week produces exactly one payout for exactly one remaining hand.
          </p>
        </div>
        <span className="badge">{method === "RANDOM" ? "RANDOM" : "MANUAL"}</span>
      </div>

      {loading ? (
        <p className="muted">Loading eligible payout weeks…</p>
      ) : weeks.length === 0 ? (
        <div className="rule">
          <strong>No payout is available yet.</strong>{" "}
          A week must finish Sunday and all seven daily contribution records must be fully paid
          before it becomes eligible.
        </div>
      ) : (
        <>
          <div className="form-grid">
            <label>
              <span>Eligible week</span>
              <select
                value={weekId}
                onChange={(event) => setWeekId(event.target.value)}
                disabled={submitting}
              >
                {weeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Week #{week.weekNumber} · {week.amount.toLocaleString()} LD
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Selection method</span>
              <select
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as "RANDOM" | "MANUAL");
                  setMemberId("");
                  setReason("");
                  setError(null);
                }}
                disabled={submitting}
              >
                <option value="RANDOM">Random draw</option>
                <option value="MANUAL">Manual selection</option>
              </select>
            </label>
          </div>

          {selectedWeek ? (
            <p className="muted">
              Week #{selectedWeek.weekNumber}: {selectedWeek.startDate} – {selectedWeek.endDate} ·
              payout {selectedWeek.amount.toLocaleString()} LD
            </p>
          ) : null}

          {method === "MANUAL" ? (
            <div className="form-grid">
              <label>
                <span>Member</span>
                <select
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  disabled={submitting}
                >
                  <option value="">Select a member</option>
                  {eligibleMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.pendingHands} pending {member.pendingHands === 1 ? "hand" : "hands"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Reason</span>
                <input
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Example: Emergency assistance"
                  disabled={submitting}
                />
              </label>
            </div>
          ) : (
            <p className="rule">
              Random draw uses a secure server-side random selection from the remaining pending
              hands. The client cannot choose the hand or payout amount.
            </p>
          )}

          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="success">{message}</p> : null}

          <button className="button" type="button" onClick={submit} disabled={!canSubmit}>
            {submitting ? "Recording payout…" : method === "RANDOM" ? "Run random draw" : "Record manual payout"}
          </button>
        </>
      )}
    </section>
  );
}
