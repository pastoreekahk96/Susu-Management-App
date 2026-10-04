import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

const money = (value: number) => `${value.toLocaleString()} LD`;

function dateOnly(value: Date) {
  return value.toLocaleDateString("en-LR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      numberOfWeeks: true,
      contributionPerHandDay: true,
      daysPerWeek: true,
      totalHandsSnapshot: true,
      weeklyPayoutAmount: true,
      members: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          handsCount: true,
          payments: {
            select: {
              expectedAmount: true,
              paidAmount: true,
              status: true,
              weekId: true,
            },
          },
        },
      },
      weeks: {
        orderBy: { weekNumber: "asc" },
        select: {
          id: true,
          weekNumber: true,
          startDate: true,
          endDate: true,
          status: true,
          payments: {
            select: {
              expectedAmount: true,
              paidAmount: true,
              status: true,
            },
          },
          payout: {
            select: {
              amount: true,
              status: true,
              selectionMethod: true,
            },
          },
        },
      },
    },
  });

  if (!cycle) {
    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">SUSU MANAGEMENT</p>
            <h1>Reports</h1>
            <p className="muted">No active cycle is currently available.</p>
          </div>
          <div className="topbar-actions">
            <a className="button secondary" href="/">Dashboard</a>
          </div>
        </header>
        <section className="card">
          <h2>No active cycle</h2>
          <p className="muted">Reports will appear when an active SUSU cycle is available.</p>
        </section>
      </main>
    );
  }

  const weeks = cycle.weeks;
  const payments = weeks.flatMap((week) => week.payments);
  const totalDue = payments.reduce((sum, payment) => sum + payment.expectedAmount, 0);
  const totalCollected = payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
  const totalBalance = totalDue - totalCollected;
  const paidRecords = payments.filter((payment) => payment.status === "PAID").length;
  const partialRecords = payments.filter((payment) => payment.status === "PARTIAL").length;
  const unpaidRecords = payments.filter((payment) => payment.status === "UNPAID").length;
  const collectionRate = totalDue === 0 ? 0 : Math.round((totalCollected / totalDue) * 100);

  const paidWeeks = weeks.filter((week) => week.status === "PAID").length;
  const eligibleWeeks = weeks.filter((week) => week.status === "ELIGIBLE").length;
  const openWeeks = weeks.filter((week) => week.status === "OPEN").length;
  const payoutTotal = weeks.reduce((sum, week) => sum + (week.payout?.amount ?? 0), 0);
  const payoutCount = weeks.filter((week) => week.payout).length;
  const randomPayouts = weeks.filter((week) => week.payout?.selectionMethod === "RANDOM").length;
  const manualPayouts = weeks.filter((week) => week.payout?.selectionMethod === "MANUAL").length;

  const memberRows = cycle.members.map((member) => {
    const due = member.payments.reduce((sum, payment) => sum + payment.expectedAmount, 0);
    const collected = member.payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
    const incomplete = member.payments.filter((payment) => payment.status !== "PAID").length;
    return {
      id: member.id,
      name: member.nameSnapshot,
      hands: member.handsCount,
      due,
      collected,
      balance: due - collected,
      incomplete,
      rate: due === 0 ? 0 : Math.round((collected / due) * 100),
    };
  });

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Reports</h1>
          <p className="muted">
            {cycle.name} · read-only financial and collection summary
          </p>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href="/current-week">Current week</a>
          <a className="button secondary" href="/weeks">Week history</a>
          <a className="button secondary" href="/payouts/history">Payout history</a>
          <a className="button secondary" href="/">Dashboard</a>
        </div>
      </header>

      <section className="stats">
        <article><span>Total expected</span><strong>{money(totalDue)}</strong></article>
        <article><span>Total collected</span><strong>{money(totalCollected)}</strong></article>
        <article><span>Outstanding balance</span><strong>{money(totalBalance)}</strong></article>
        <article><span>Collection rate</span><strong>{collectionRate}%</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Cycle overview</h2>
            <p className="muted">
              {cycle.totalHandsSnapshot} hands · {cycle.numberOfWeeks} weeks · {cycle.contributionPerHandDay} LD per hand per day
            </p>
          </div>
          <span className="badge">{cycle.daysPerWeek} contribution days/week</span>
        </div>

        <div className="stats">
          <article><span>Open weeks</span><strong>{openWeeks}</strong></article>
          <article><span>Eligible weeks</span><strong>{eligibleWeeks}</strong></article>
          <article><span>Paid weeks</span><strong>{paidWeeks}</strong></article>
          <article><span>Payouts recorded</span><strong>{payoutCount}</strong></article>
        </div>

        <div className="progress-track" aria-label={`Cycle collection: ${collectionRate}%`}>
          <div className="progress-fill" style={{ width: `${collectionRate}%` }} />
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Payment record status</h2>
            <p className="muted">All daily member payment records in the active cycle.</p>
          </div>
        </div>
        <div className="stats">
          <article><span>Paid records</span><strong>{paidRecords}</strong></article>
          <article><span>Partial records</span><strong>{partialRecords}</strong></article>
          <article><span>Unpaid records</span><strong>{unpaidRecords}</strong></article>
          <article><span>Total records</span><strong>{payments.length}</strong></article>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Weekly collection report</h2>
            <p className="muted">Expected, collected, balance, completion, and payout status for each week.</p>
          </div>
        </div>
        <div className="week-history-list">
          {weeks.map((week) => {
            const due = week.payments.reduce((sum, payment) => sum + payment.expectedAmount, 0);
            const collected = week.payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
            const incomplete = week.payments.filter((payment) => payment.status !== "PAID").length;
            const rate = due === 0 ? 0 : Math.round((collected / due) * 100);
            return (
              <article className="week-history-row" key={week.id}>
                <div>
                  <strong>Week {week.weekNumber}</strong>
                  <span>{dateOnly(week.startDate)} – {dateOnly(week.endDate)}</span>
                </div>
                <div>
                  <strong>{money(collected)}</strong>
                  <span>of {money(due)}</span>
                </div>
                <div>
                  <strong>{rate}%</strong>
                  <span>{incomplete} incomplete</span>
                </div>
                <div>
                  <span className={week.status === "PAID" ? "status" : "badge"}>{week.status}</span>
                  <span>{week.payout ? `Payout: ${money(week.payout.amount)}` : "No payout"}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Member contribution report</h2>
            <p className="muted">Active-cycle snapshot; balances are based on recorded daily payments.</p>
          </div>
        </div>
        <div className="member-grid">
          {memberRows.map((member) => (
            <article className="member" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span>{member.hands} {member.hands === 1 ? "hand" : "hands"} · {member.incomplete} incomplete</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>{money(member.collected)}</strong>
                <span>{member.rate}% · balance {money(member.balance)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Payout summary</h2>
            <p className="muted">Recorded payouts for this active cycle.</p>
          </div>
        </div>
        <div className="stats">
          <article><span>Total payout value</span><strong>{money(payoutTotal)}</strong></article>
          <article><span>Payouts recorded</span><strong>{payoutCount}</strong></article>
          <article><span>Random selections</span><strong>{randomPayouts}</strong></article>
          <article><span>Manual selections</span><strong>{manualPayouts}</strong></article>
        </div>
        <div className="rule">
          <strong>Integrity rule:</strong> each paid week can have only one payout, and each payout selects exactly one individual hand.
        </div>
      </section>
    </main>
  );
}
