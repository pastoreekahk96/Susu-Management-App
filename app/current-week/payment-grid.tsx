"use client";

import { useState } from "react";

type Payment = {
  id: string;
  dayIndex: number;
  expectedAmount: number;
  paidAmount: number;
  status: "UNPAID" | "PARTIAL" | "PAID";
};

type Member = {
  id: string;
  name: string;
  handsCount: number;
  dailyDue: number;
  payments: Payment[];
};

type Day = {
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
}: {
  members: Member[];
  days: Day[];
  editable: boolean;
}) {
  const [rows, setRows] = useState(members);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function savePayment(payment: Payment, value: string) {
    setMessage("");
    const amount = Number(value);

    if (!Number.isInteger(amount) || amount < 0 || amount > payment.expectedAmount) {
      setMessage(`Enter a whole-number amount from 0 to ${payment.expectedAmount} LD.`);
      return;
    }

    setSaving(payment.id);

    try {
      const response = await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, amount }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Could not save payment.");
        return;
      }

      setRows((current) =>
        current.map((member) => ({
          ...member,
          payments: member.payments.map((item) =>
            item.id === payment.id
              ? { ...item, paidAmount: data.paidAmount, status: data.status }
              : item
          ),
        }))
      );
      setMessage("Payment saved.");
    } catch {
      setMessage("Could not connect to the server.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      {message && <p className="save-message" role="status">{message}</p>}

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
                            value={payment.paidAmount === 0 ? "" : payment.paidAmount}
                            disabled={!editable || saving === payment.id}
                            onChange={(event) => {
                              const value = event.target.value;
                              setRows((current) =>
                                current.map((item) => ({
                                  ...item,
                                  payments: item.payments.map((p) =>
                                    p.id === payment.id ? { ...p, paidAmount: value === "" ? 0 : Number(value), status: p.status } : p
                                  ),
                                }))
                              );
                            }}
                            onBlur={(event) => savePayment(payment, event.target.value)}
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
