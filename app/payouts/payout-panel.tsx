"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export default function PayoutPanel({
  weeks,
  members,
}: {
  weeks: EligibleWeek[];
  members: Member[];
}) {
  const router = useRouter();
  const [weekId, setWeekId] = useState(weeks[0]?.id ?? "");
  const [method, setMethod] = useState<"RANDOM" | "MANUAL">("RANDOM");
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWeek = weeks.find((week) => week.id === weekId);
  const eligibleMembers = members.filter((member) => member.pendingHands > 0);

  async function submit() {
    if (!weekId) return;

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
      router.refresh();
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

      {weeks.length === 0 ? (
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
