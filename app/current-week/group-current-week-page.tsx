import Link from "next/link";
import type { GroupRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireGroupRole } from "../../lib/group-auth";
import { createGroupCurrentWeekReader } from "../../lib/group-current-week";
import { memberGroupSelection } from "../../lib/member-group-selection";
import PaymentGrid from "./payment-grid";
import ThemeToggle from "../theme-toggle";

type Membership = { groupId: string; role: GroupRole; group: { name: string } };
export default async function GroupCurrentWeekPage({ memberships, requested }: {
  memberships: Membership[]; requested: string | string[] | undefined;
}) {
  const selection = memberGroupSelection(memberships, requested);
  const selected = selection.mode === "group" ? selection.selected : undefined;
  let denied = selection.mode === "denied";
  let failed = false;
  let data: Awaited<ReturnType<ReturnType<typeof createGroupCurrentWeekReader>>> | undefined;
  if (selected) {
    try { data = await createGroupCurrentWeekReader(prisma, requireGroupRole)(selected.groupId); }
    catch (error) {
      if (error instanceof Error && ["AUTH_REQUIRED", "FORBIDDEN"].includes(error.message)) denied = true;
      else { failed = true; console.error("Group current-week page read failed"); }
    }
  }
  const cycle = data?.cycle;
  const week = data?.week;
  const members = cycle ? (data?.members ?? []).map(member => ({
    id: member.id, name: member.nameSnapshot, handsCount: member.handsCount,
    dailyDue: member.handsCount * cycle.contributionPerHandDay, payments: member.payments,
  })) : [];
  const due = cycle ? members.reduce((sum, member) => sum + member.dailyDue * cycle.daysPerWeek, 0) : 0;
  const paid = members.reduce((sum, member) => sum + member.payments.reduce((total, payment) => total + payment.paidAmount, 0), 0);
  const days = week ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((name, dayIndex) => {
    const date = new Date(week.startDate); date.setUTCDate(date.getUTCDate() + dayIndex);
    return { name, shortName: name.slice(0, 3), date, dayIndex };
  }) : [];
  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">SUSU MANAGEMENT</p><h1>Current week payments</h1>
          <p className="muted">{selected && !denied ? selected.group.name : "Choose your group to view its contributions."}</p></div>
        <div className="topbar-actions"><ThemeToggle /><Link className="button secondary" href="/">Dashboard</Link>
          <Link className="button secondary" href={selected && !denied ? `/members?group=${encodeURIComponent(selected.groupId)}` : "/members"}>Members</Link></div>
      </header>
      {memberships.length > 0 ? <section className="card">
        <form action="/current-week" method="get" className="member-add-form">
          <label htmlFor="current-week-group">Group</label>
          <select id="current-week-group" name="group" defaultValue={selected?.groupId ?? ""} required>
            <option value="" disabled>Select a group</option>
            {memberships.map(m => <option key={m.groupId} value={m.groupId}>{m.group.name}</option>)}
          </select>
          <button className="button" type="submit">Open group</button>
        </form>
      </section> : null}
      {denied ? <section className="card"><p role="alert" className="error">You do not have staff access to this group.</p></section>
        : failed ? <section className="card"><p role="alert" className="error">Unable to load this group&apos;s current week. Reload to try again.</p></section>
        : !selected ? <section className="card"><p>Select a group to view its current week.</p></section>
        : !cycle ? <section className="card"><h2>No active cycle</h2><p>This group has no active SUSU cycle.</p></section>
        : !week ? <section className="card"><p>No week is available for this group.</p></section>
        : <>
          <section className="rule"><strong>Read-only register:</strong> recorded contributions and balances are shown below.</section>
          <section className="stats">
            <article><span>Week</span><strong>#{week.weekNumber}</strong></article>
            <article><span>Amount due</span><strong>{due.toLocaleString()} LD</strong></article>
            <article><span>Amount paid</span><strong>{paid.toLocaleString()} LD</strong></article>
            <article><span>Balance</span><strong>{(due - paid).toLocaleString()} LD</strong></article>
          </section>
          <section className="card"><div className="section-heading"><div><h2>Daily contribution register</h2>
            <p className="muted">{cycle.name} · {cycle.contributionPerHandDay} LD per hand/day · Monday–Sunday</p></div><span className="badge">{week.status}</span></div>
            <PaymentGrid key={`${selected.groupId}:${week.id}`} members={members} days={days} editable={false} />
          </section>
        </>}
    </main>
  );
}
