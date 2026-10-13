"use client";

import { useRef, useState } from "react";

type Payment = {
  id: string;
  dayIndex: number;
  expectedAmount: number;
  paidAmount: number;
  status: "UNPAID" | "PARTIAL" | "PAID";
};

export type PaymentMember = {
  id: string;
  name: string;
  handsCount: number;
  dailyDue: number;
  payments: Payment[];
};

export type PaymentDay = {
  name: string;
  shortName: string;
  date: string | Date;
  dayIndex: number;
};

function money(value: number) {
  return `${value.toLocaleString()} LD`;
}

function dateLabel(value: string | Date) {
  return new Date(value).toLocaleDateString("en-LR", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function PaymentGrid({
  members,
  days,
  editable,
  groupId,
  onPaymentSaved,
}: {
  members: PaymentMember[];
  days: PaymentDay[];
  editable: boolean;
  groupId?: string;
  onPaymentSaved?: (payment: Pick<Payment, "id" | "paidAmount" | "status">) => void;
}) {
  const [rows, setRows] = useState(members);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const pending = useRef(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState("");

  function clearDraft(id: string) {
    setDrafts(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function savePayment(payment: Payment, value: string, badInput: boolean) {
    if (!editable || pending.current || needsReload) return;
    const amount = Number(value);
    setMessage("");
    if (badInput || !Number.isSafeInteger(amount) || amount < 0 || amount > payment.expectedAmount) {
      clearDraft(payment.id);
      setMessage(`Enter a whole-number amount from 0 to ${payment.expectedAmount} LD.`);
      return;
    }
    if (amount === payment.paidAmount) {
      clearDraft(payment.id);
      return;
    }

    pending.current = true;
    setSaving(payment.id);
    setMessage("Saving payment…");
    try {
      const endpoint = groupId ? `/api/groups/${encodeURIComponent(groupId)}/payments` : "/api/payments";
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, amount }),
      });
      const data = await response.json();
      if (!response.ok) {
        clearDraft(payment.id);
        setMessage(typeof data?.error === "string" ? data.error : "Could not save payment.");
        // A stale permission/week or uncertain server response requires a fresh read.
        if (response.status !== 400) setNeedsReload(true);
        return;
      }
      const expectedStatus = amount === 0 ? "UNPAID" : amount === payment.expectedAmount ? "PAID" : "PARTIAL";
      if (data?.id !== payment.id || data.paidAmount !== amount || data.status !== expectedStatus) {
        throw new Error("UNCONFIRMED_PAYMENT");
      }
      const saved = { id: payment.id, paidAmount: data.paidAmount, status: expectedStatus } as const;
      setRows(current => current.map(member => ({
        ...member,
        payments: member.payments.map(item => item.id === payment.id ? { ...item, ...saved } : item),
      })));
      clearDraft(payment.id);
      onPaymentSaved?.(saved);
      setMessage("Payment saved.");
    } catch {
      clearDraft(payment.id);
      setNeedsReload(true);
      setMessage("Could not confirm the payment. Reload before trying again.");
    } finally {
      pending.current = false;
      setSaving(null);
    }
  }

  return (
    <>
      {message && <p className="save-message" role="status">{message}</p>}
      {needsReload ? <button className="button secondary" type="button" onClick={() => window.location.reload()}>Reload payments</button> : null}

      <div className="payment-legend" aria-label="Payment status legend">
        <span><i className="legend-dot paid" /> Paid</span>
        <span><i className="legend-dot partial" /> Partial</span>
        <span><i className="legend-dot unpaid" /> Unpaid</span>
      </div>

      <div className="payment-table-wrap">
        <table className="payment-table">
          <thead>
            <tr>
              <th>Member</th>
              {days.map((day) => (
                <th key={day.dayIndex}>
                  {day.shortName}<span>{dateLabel(day.date)}</span>
                </th>
              ))}
              <th>Week paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => {
              const weekPaid = member.payments.reduce((sum, payment) => sum + payment.paidAmount, 0);

              return (
                <tr key={member.id}>
                  <th>
                    <strong>{member.name}</strong>
                    <span>{member.handsCount} {member.handsCount === 1 ? "hand" : "hands"} · {money(member.dailyDue)}/day</span>
                  </th>
                  {days.map((day) => {
                    const payment = member.payments.find((item) => item.dayIndex === day.dayIndex);
                    if (!payment) return <td key={day.dayIndex}>—</td>;

                    return (
                      <td key={day.dayIndex} className={`payment-cell-${payment.status.toLowerCase()}`}>
                        <div className="payment-cell">
                          <input
                            aria-label={`${member.name} ${day.name} payment`}
                            type="number"
                            min="0"
                            max={payment.expectedAmount}
                            step="1"
                            value={drafts[payment.id] ?? (payment.paidAmount === 0 ? "" : String(payment.paidAmount))}
                            disabled={!editable || saving !== null || needsReload}
                            inputMode="numeric"
                            onChange={event => {
                              const value = event.target.value;
                              setDrafts(current => ({ ...current, [payment.id]: value }));
                            }}
                            onBlur={event => savePayment(payment, event.target.value, event.target.validity.badInput)}
                          />
                          <small className={`payment-status ${payment.status.toLowerCase()}`}>
                            {payment.status}
                          </small>
                        </div>
                      </td>
                    );
                  })}
                  <td className="week-paid">{money(weekPaid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
