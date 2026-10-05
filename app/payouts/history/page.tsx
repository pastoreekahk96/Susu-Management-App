import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

function money(value: number) {
  return `${value.toLocaleString()} LD`;
}

function dateTime(value: Date) {
  return value.toLocaleString("en-LR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export default async function PayoutHistoryPage() {
  try {
    await requireRole("ADMIN");
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") redirect("/login");
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  const payouts = cycle
    ? await prisma.payout.findMany({
        where: { week: { cycleId: cycle.id } },
        orderBy: { drawnAt: "desc" },
        select: {
          id: true,
          amount: true,
          selectionMethod: true,
          manualReason: true,
          status: true,
          drawnAt: true,
          collectedAt: true,
          week: { select: { weekNumber: true, startDate: true, endDate: true } },
          hand: {
            select: {
              handNumber: true,
              cycleMember: { select: { nameSnapshot: true } },
            },
          },
          recordedBy: { select: { name: true, email: true } },
        },
      })
    : [];

  const totalPaid = payouts.reduce((sum, payout) => sum + payout.amount, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Payout history</h1>
          <p className="muted">
            {cycle?.name ?? "No active cycle"} · completed weekly payout records
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="button secondary" href="/payouts">Payouts</Link>
          <Link className="button secondary" href="/weeks">Week history</Link>
          <Link className="button secondary" href="/">Dashboard</Link>
        </div>
      </header>

      <section className="stats">
        <article><span>Total payouts</span><strong>{payouts.length}</strong></article>
        <article><span>Total paid</span><strong>{money(totalPaid)}</strong></article>
        <article><span>Random draws</span><strong>{payouts.filter((p) => p.selectionMethod === "RANDOM").length}</strong></article>
        <article><span>Manual selections</span><strong>{payouts.filter((p) => p.selectionMethod === "MANUAL").length}</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Recorded payouts</h2>
            <p className="muted">
              Each record represents one hand selected for one weekly payout.
            </p>
          </div>
        </div>

        {payouts.length === 0 ? (
          <div className="rule">
            <strong>No payouts recorded yet.</strong> Payout history will appear here after an eligible week is paid.
          </div>
        ) : (
          <div className="payout-history-list">
            {payouts.map((payout) => (
              <article className="payout-history-row" key={payout.id}>
                <div>
                  <div className="payout-history-title">
                    <strong>Week {payout.week.weekNumber}</strong>
                    <span className={payout.status === "COLLECTED" ? "status" : "badge"}>{payout.status}</span>
                  </div>
                  <span className="muted">
                    {payout.week.startDate.toLocaleDateString("en-LR", { month: "short", day: "numeric", timeZone: "UTC" })}
                    {" – "}
                    {payout.week.endDate.toLocaleDateString("en-LR", { month: "short", day: "numeric", timeZone: "UTC" })}
                  </span>
                </div>

                <div className="payout-history-member">
                  <strong>{payout.hand.cycleMember.nameSnapshot}</strong>
                  <span>Hand #{payout.hand.handNumber}</span>
                </div>

                <div className="payout-history-amount">
                  <strong>{money(payout.amount)}</strong>
                  <span>{payout.selectionMethod.toLowerCase()} selection</span>
                </div>

                <div className="payout-history-meta">
                  <span>Drawn: {dateTime(payout.drawnAt)}</span>
                  <span>{payout.recordedBy ? `Recorded by: ${payout.recordedBy.name}` : "Recorded by: system"}</span>
                  {payout.manualReason ? <span>Reason: {payout.manualReason}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rule">
        <strong>Payout rule:</strong> one individual hand is selected per paid week. A member with multiple
        hands can appear again in a later week, but only one of that member&apos;s remaining hands is selected at a time.
      </section>
    </main>
  );
}
