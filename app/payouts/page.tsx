import { prisma } from "../../lib/prisma";
import PayoutPanel from "./payout-panel";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-LR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PayoutsPage() {
  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!cycle) {
    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">SUSU MANAGEMENT</p>
            <h1>Weekly payouts</h1>
          </div>
          <a className="button secondary" href="/">Dashboard</a>
        </header>
        <section className="card">
          <h2>No active cycle</h2>
          <p className="muted">Create an active SUSU cycle before recording payouts.</p>
        </section>
      </main>
    );
  }

  const [weeks, members] = await Promise.all([
    prisma.week.findMany({
      where: { cycleId: cycle.id, status: "ELIGIBLE" },
      orderBy: { weekNumber: "asc" },
      select: {
        id: true,
        weekNumber: true,
        startDate: true,
        endDate: true,
        cycle: { select: { weeklyPayoutAmount: true } },
      },
    }),
    prisma.cycleMember.findMany({
      where: { cycleId: cycle.id },
      orderBy: { nameSnapshot: "asc" },
      select: {
        id: true,
        nameSnapshot: true,
        hands: {
          where: { status: "PENDING" },
          select: { id: true },
        },
      },
    }),
  ]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Weekly payouts</h1>
          <p className="muted">
            Select an eligible week, then use a random draw or authorized manual selection.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href="/current-week">Current week</a>
          <a className="button secondary" href="/">Dashboard</a>
        </div>
      </header>

      <PayoutPanel
        weeks={weeks.map((week) => ({
          id: week.id,
          weekNumber: week.weekNumber,
          startDate: formatDate(week.startDate),
          endDate: formatDate(week.endDate),
          amount: week.cycle.weeklyPayoutAmount,
        }))}
        members={members.map((member) => ({
          id: member.id,
          name: member.nameSnapshot,
          pendingHands: member.hands.length,
        }))}
      />

      <section className="rule">
        <strong>Locked payout rule:</strong> one hand is paid per eligible week. A member with
        multiple hands receives only one hand in a single weekly payout. Every payout is recorded
        with its method and audit information.
      </section>
    </main>
  );
}
