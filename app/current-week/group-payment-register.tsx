"use client";

import { useState } from "react";
import { groupWeekReadiness } from "../../lib/group-week-readiness";
import GroupCompleteWeekButton from "./group-complete-week-button";
import PaymentGrid, { type PaymentMember, type PaymentDay } from "./payment-grid";

export default function GroupPaymentRegister({
  groupId, members, days, amountDue, weekNumber, weekStatus, cycleName, contributionPerHandDay, weekId, endDate, daysPerWeek, canComplete,
}: {
  weekId: string;
  endDate: string;
  daysPerWeek: number;
  canComplete: boolean;
  groupId: string;
  members: PaymentMember[];
  days: PaymentDay[];
  amountDue: number;
  weekNumber: number;
  weekStatus: "OPEN" | "ELIGIBLE" | "PAID";
  cycleName: string;
  contributionPerHandDay: number;
}) {
  const [editingBlocked, setEditingBlocked] = useState(true);
  const [completionLocked, setCompletionLocked] = useState(false);
  const [savedMembers, setSavedMembers] = useState(members);
  const paid = savedMembers.reduce((sum, member) => sum + member.payments.reduce((total, payment) => total + payment.paidAmount, 0), 0);
  return (
    <>
      <section className="stats" aria-label="Saved weekly totals">
        <article><span>Week</span><strong>#{weekNumber}</strong></article>
        <article><span>Amount due</span><strong>{amountDue.toLocaleString()} LD</strong></article>
        <article><span>Amount paid</span><strong>{paid.toLocaleString()} LD</strong></article>
        <article><span>Balance</span><strong>{(amountDue - paid).toLocaleString()} LD</strong></article>
      </section>
      <section className="card"><div className="section-heading"><div><h2>Daily contribution register</h2>
        <p className="muted">{cycleName} · {contributionPerHandDay} LD per hand/day · Monday–Sunday</p></div><span className="badge">{weekStatus}</span></div>
        <PaymentGrid members={members} days={days} editable={weekStatus === "OPEN"} groupId={groupId}
          locked={completionLocked} onEditingStateChange={setEditingBlocked}
          onPaymentSaved={saved => setSavedMembers(current => current.map(member => ({
            ...member, payments: member.payments.map(payment => payment.id === saved.id ? { ...payment, ...saved } : payment),
          })))} />
      </section>
      {canComplete && weekStatus === "OPEN" ? <GroupCompleteWeekButton groupId={groupId} weekId={weekId}
        reason={editingBlocked ? "Finish payment edits and saves before completing this week." : groupWeekReadiness(savedMembers, daysPerWeek, endDate, new Date())}
        onLockChange={setCompletionLocked} /> : null}
    </>
  );
}
