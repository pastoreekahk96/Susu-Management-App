import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-LR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function money(value: number) {
  return `${value.toLocaleString()} LD`;
}

export default async function WeeksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      weeks: {
        orderBy: { weekNumber: "asc" },
        include: {
          payments: {
            select: { expectedAmount: true, paidAmount: true, status: true },
          },
          payout: {
            select: { amount: true, status: true, selectionMethod: true, handId: true },
          },
        },
      },
    },
  });

  if (!cycle) {
    return (
      <main className="shell">
        <section className="card">
          <h1>No active cycle</h1>
          <p className="muted">There is no active SUSU cycle to review.</p>
        </section>
      </main>
    );
  }

  const weeks = cycle.weeks.map((week) => {
    const due = week.payments.reduce((sum, payment) => sum + payment.expectedAmount, 0);
    const paid = week.payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
    const incomplete = week.payments.filter((payment) => payment.status !== "PAID").length;
    const percent = due === 0 ? 0 : Math.round((paid / due) * 100);

    return {
      ...week,
      due,
      paid,
      balance: due - paid,
      incomplete,
      percent,
    };
  });

  const paidWeeks = weeks.filter((week) => week.status === "PAID").length;
  const eligibleWeeks = weeks.filter((week) => week.status === "ELIGIBLE").length;
  const openWeeks = weeks.filter((week) => week.status === "OPEN").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Week history</h1>
          <p className="muted">
            {cycle.name} · {cycle.numberOfWeeks} weekly contribution periods
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="button secondary" href="/current-week">Current week</Link>
          <Link className="button secondary" href="/">Dashboard</Link>
        </div>
      </header>

      <section className="stats">
        <article><span>Total weeks</span><strong>{weeks.length}</strong></article>
        <article><span>Paid weeks</span><strong>{paidWeeks}</strong></article>
        <article><span>Eligible</span><strong>{eligibleWeeks}</strong></article>
        <article><span>Open</span><strong>{openWeeks}</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Contribution periods</h2>
            <p className="muted">Historical weeks are read-only. Payment editing remains available only on the current open week.</p>
          </div>
        </div>

        <div className="week-history-list">
          {weeks.map((week) => (
            <article className="week-history-row" key={week.id}>
              <div className="week-history-main">
                <div className="week-history-title">
                  <strong>Week {week.weekNumber}</strong>
                  <span className={week.status === "PAID" ? "status" : week.status === "ELIGIBLE" ? "status warning" : "badge"}>
                    {week.status}
                  </span>
                </div>
                <span className="muted">{formatDate(week.startDate)} – {formatDate(week.endDate)}</span>
              </div>

              <div className="week-history-progress">
                <div className="week-history-amounts">
                  <strong>{money(week.paid)}</strong>
                  <span>of {money(week.due)}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${week.percent}%` }} />
                </div>
                <small>
                  {week.percent}% collected · {week.incomplete === 0 ? "All daily payments paid" : `${week.incomplete} incomplete daily records`}
                </small>
              </div>

              <div className="week-history-payout">
                {week.payout ? (
                  <>
                    <strong>{money(week.payout.amount)}</strong>
                    <span>Payout · {week.payout.selectionMethod.toLowerCase()}</span>
                  </>
                ) : (
                  <span className="muted">No payout recorded</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rule">
        <strong>History rule:</strong> completed and paid weeks are preserved as historical records.
        This page does not provide payment or payout controls, preventing accidental changes to past weeks.
      </section>
    </main>
  );
}
