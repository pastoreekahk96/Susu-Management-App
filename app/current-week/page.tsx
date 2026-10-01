import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import PaymentGrid from "./payment-grid";
import CompleteWeekButton from "./complete-week-button";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-LR", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function CurrentWeekPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      weeks: { orderBy: { weekNumber: "asc" } },
    },
  });

  if (!cycle) {
    return (
      <main className="shell">
        <section className="card">
          <h1>No active cycle</h1>
          <p className="muted">Create an active SUSU cycle before recording payments.</p>
        </section>
      </main>
    );
  }

  const today = startOfUtcDay(new Date());
  const firstWeek = cycle.weeks[0];
  const lastWeek = cycle.weeks[cycle.weeks.length - 1];

  let week = cycle.weeks.find(
    (candidate) => today >= startOfUtcDay(candidate.startDate) && today <= startOfUtcDay(candidate.endDate)
  );

  if (!week && firstWeek && today < startOfUtcDay(firstWeek.startDate)) week = firstWeek;
  if (!week && lastWeek && today > startOfUtcDay(lastWeek.endDate)) week = lastWeek;

  if (!week) {
    return <main className="shell"><section className="card"><p>No week is available.</p></section></main>;
  }

  const members = await prisma.cycleMember.findMany({
    where: { cycleId: cycle.id },
    orderBy: { nameSnapshot: "asc" },
    include: {
      payments: {
        where: { weekId: week.id },
        orderBy: { dayIndex: "asc" },
      },
    },
  });

  const paymentDays = dayNames.map((name, index) => ({
    name,
    shortName: name.slice(0, 3),
    date: addDays(startOfUtcDay(week.startDate), index),
    dayIndex: index,
  }));

  const serializedMembers = members.map((member) => ({
    id: member.id,
    name: member.nameSnapshot,
    handsCount: member.handsCount,
    dailyDue: member.handsCount * cycle.contributionPerHandDay,
    payments: member.payments.map((payment) => ({
      id: payment.id,
      dayIndex: payment.dayIndex,
      expectedAmount: payment.expectedAmount,
      paidAmount: payment.paidAmount,
      status: payment.status,
    })),
  }));

  const totalDue = serializedMembers.reduce((sum, member) => sum + member.dailyDue * cycle.daysPerWeek, 0);
  const totalPaid = serializedMembers.reduce(
    (sum, member) => sum + member.payments.reduce((memberSum, payment) => memberSum + payment.paidAmount, 0),
    0
  );
  const incompletePayments = serializedMembers.reduce(
    (sum, member) =>
      sum + member.payments.filter((payment) => payment.paidAmount !== payment.expectedAmount).length,
    0
  );
  const weekCanBeCompleted =
    week.status === "OPEN" && today >= addDays(startOfUtcDay(week.endDate), 1) && incompletePayments === 0;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Current week payments</h1>
          <p className="muted">
            Week {week.weekNumber} · {formatDate(week.startDate)} – {formatDate(week.endDate)} · 50 LD per hand/day
          </p>
        </div>
        <a className="button secondary" href="/">Dashboard</a>
      </header>

      <section className="stats">
        <article><span>Week</span><strong>#{week.weekNumber}</strong></article>
        <article><span>Amount due</span><strong>{totalDue.toLocaleString()} LD</strong></article>
        <article><span>Amount paid</span><strong>{totalPaid.toLocaleString()} LD</strong></article>
        <article><span>Balance</span><strong>{(totalDue - totalPaid).toLocaleString()} LD</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Daily contribution register</h2>
            <p className="muted">
              Enter the amount actually received for each member and day. Full payment is marked automatically.
              Partial payment stays visible as a balance.
            </p>
          </div>
          <div>
            <span className={week.status === "OPEN" ? "badge" : "status"}>
              {week.status}
            </span>
            {weekCanBeCompleted ? (
              <div style={{ marginTop: "0.75rem" }}>
                <CompleteWeekButton weekId={week.id} />
              </div>
            ) : null}
          </div>
        </div>

        <PaymentGrid
          members={serializedMembers}
          days={paymentDays}
          editable={week.status === "OPEN"}
        />
      </section>

      <section className="rule">
        <strong>Week rule:</strong> contributions run Monday–Sunday. The week becomes payout-eligible only
        after Sunday has ended and every member is fully paid for all seven contribution days.
        {week.status === "OPEN" && incompletePayments > 0 ? (
          <span> There are {incompletePayments} incomplete daily payment records.</span>
        ) : null}
      </section>
    </main>
  );
}
