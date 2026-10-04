import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { prisma } from "../lib/prisma";
import SignOutButton from "./sign-out-button";

const fallbackMembers = [
  ["Kumba Fayah", 4],
  ["Daniel Moore", 1],
  ["Abraham Tarplah", 1],
  ["Randall Blakepeh", 1],
  ["Deborah Tokpah", 2],
  ["Kumbah Ukaegbu", 10],
  ["Wisdom Tarplah", 2],
  ["Cecelia Ukaegbu", 3],
  ["Judith Idee", 2],
  ["Bendu Garseeda", 2],
  ["Maron Dahn", 4],
  ["Christina", 2],
  ["Fallah Fayiah", 4],
  ["P. Arthur", 5],
  ["Rachel Fayiah", 4],
] as const;

const money = (value: number) => `${value.toLocaleString()} LD`;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-LR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let cycle:
    | {
        id: string;
        name: string;
        status: string;
        totalHandsSnapshot: number;
        weeklyPayoutAmount: number;
        members: { nameSnapshot: string; handsCount: number }[];
        weeks: {
          id: string;
          weekNumber: number;
          startDate: Date;
          endDate: Date;
          status: string;
          payments: { expectedAmount: number; paidAmount: number; status: string; dayIndex: number }[];
        }[];
      }
    | null = null;

  let databaseReady = false;

  if (process.env.DATABASE_URL) {
    try {
      cycle = await prisma.cycle.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: {
          members: {
            orderBy: { nameSnapshot: "asc" },
            select: { nameSnapshot: true, handsCount: true },
          },
          weeks: {
            orderBy: { weekNumber: "asc" },
            include: {
              payments: {
                select: { expectedAmount: true, paidAmount: true, status: true, dayIndex: true },
              },
            },
          },
        },
      });
      databaseReady = true;
    } catch {
      databaseReady = false;
    }
  }

  const members = cycle?.members.map((member) => [
    member.nameSnapshot,
    member.handsCount,
  ] as const) ?? fallbackMembers;

  const totalHands =
    cycle?.totalHandsSnapshot ??
    members.reduce((sum, [, hands]) => sum + hands, 0);
  const dailyTotal = totalHands * 50;
  const weeklyTotal = cycle?.weeklyPayoutAmount ?? dailyTotal * 7;

  const today = startOfUtcDay(new Date());
  const currentWeek = cycle?.weeks.find(
    (week) => today >= startOfUtcDay(week.startDate) && today <= startOfUtcDay(week.endDate)
  );

  const currentWeekDue = currentWeek
    ? currentWeek.payments.reduce((sum, payment) => sum + payment.expectedAmount, 0)
    : 0;
  const currentWeekPaid = currentWeek
    ? currentWeek.payments.reduce((sum, payment) => sum + payment.paidAmount, 0)
    : 0;
  const currentWeekIncomplete = currentWeek
    ? currentWeek.payments.filter((payment) => payment.status !== "PAID").length
    : 0;
  const currentWeekProgress = currentWeekDue === 0
    ? 0
    : Math.round((currentWeekPaid / currentWeekDue) * 100);
  const todayDayIndex = currentWeek
    ? Math.min(6, Math.max(0, Math.floor(
        (today.getTime() - startOfUtcDay(currentWeek.startDate).getTime()) / 86400000
      )))
    : 0;
  const todayPaid = currentWeek
    ? currentWeek.payments
        .filter((payment) => payment.dayIndex === todayDayIndex)
        .reduce((sum, payment) => sum + payment.paidAmount, 0)
    : 0;
  const todayDue = currentWeek
    ? currentWeek.payments
        .filter((payment) => payment.dayIndex === todayDayIndex)
        .reduce((sum, payment) => sum + payment.expectedAmount, 0)
    : 0;
  const payoutReady = currentWeek?.status === "ELIGIBLE";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Community cycle dashboard</h1>
          <p className="muted">
            {cycle?.name ?? "47-hand cycle"} · Monday–Sunday contributions · payout after Sunday
          </p>
        </div>
        <div className="topbar-actions">
          <a className="button" href="/current-week">Current week</a>
          <a className="button secondary" href="/members">Members</a>
          <a className="button secondary" href="/weeks">Week history</a>
          <a className="button secondary" href="/payouts">Payouts</a>
          <span className={databaseReady ? "status" : "status warning"}>
            {databaseReady ? "Database connected" : "Database setup needed"}
          </span>
          <SignOutButton />
        </div>
      </header>

      {!databaseReady && (
        <section className="setup-notice">
          <strong>The application is built; the database is the remaining connection.</strong>
          <p className="muted">
            Add DATABASE_URL to the deployment environment, then run the Prisma migration and seed commands.
            The dashboard will switch from the temporary fallback data to the real PostgreSQL records.
          </p>
        </section>
      )}

      <section className="stats">
        <article><span>Current week</span><strong>{currentWeek ? `#${currentWeek.weekNumber}` : "—"}</strong></article>
        <article><span>Week status</span><strong>{currentWeek?.status ?? "—"}</strong></article>
        <article><span>Amount collected</span><strong>{money(currentWeekPaid)}</strong></article>
        <article><span>Balance</span><strong>{money(currentWeekDue - currentWeekPaid)}</strong></article>
      </section>

      {currentWeek ? (
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>What is happening now?</h2>
              <p className="muted">
                Week {currentWeek.weekNumber} · {formatDate(currentWeek.startDate)} – {formatDate(currentWeek.endDate)}
              </p>
            </div>
            <span className={payoutReady ? "status" : "badge"}>
              {payoutReady ? "Ready for payout" : currentWeek.status}
            </span>
          </div>

          <div className="stats">
            <article><span>Weekly collection</span><strong>{currentWeekProgress}%</strong></article>
            <article><span>Incomplete records</span><strong>{currentWeekIncomplete}</strong></article>
            <article><span>Collected today</span><strong>{money(todayPaid)}</strong></article>
            <article><span>Today's balance</span><strong>{money(todayDue - todayPaid)}</strong></article>
          </div>

          <div className="progress-track" aria-label={`Current week collection: ${currentWeekProgress}%`}>
            <div className="progress-fill" style={{ width: `${currentWeekProgress}%` }} />
          </div>

          <div className="topbar-actions" style={{ marginTop: "16px" }}>
            <a className="button" href="/current-week">Open current week register</a>
            {payoutReady ? <a className="button secondary" href="/payouts">Review payout</a> : null}
            <a className="button secondary" href="/payouts/history">Payout history</a>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>No current week found</h2>
          <p className="muted">The active cycle is available, but today's date is outside its weekly schedule.</p>
        </section>
      )}

      <section className="stats">
        <article><span>Members</span><strong>{members.length}</strong></article>
        <article><span>Total hands</span><strong>{totalHands}</strong></article>
        <article><span>Daily collection</span><strong>{money(dailyTotal)}</strong></article>
        <article><span>Weekly payout</span><strong>{money(weeklyTotal)}</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{cycle?.name ?? "Cycle members"}</h2>
            <p className="muted">
              Each member appears once; each hand remains an independent payout spot.
            </p>
          </div>
          <span className="badge">{totalHands} payout spots</span>
        </div>

        <div className="member-grid">
          {members.map(([name, hands]) => (
            <div className="member" key={name}>
              <div>
                <strong>{name}</strong>
                <span>{hands} {hands === 1 ? "hand" : "hands"}</span>
              </div>
              <span className="amount">{money(hands * 50)}/day</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rule">
        <strong>Business rule locked:</strong> Week 1 runs September 14–20, 2026.
        Sunday is the seventh contribution day. The draw becomes eligible only after the week is complete,
        and exactly one pending hand can be paid for that week.
      </section>
    </main>
  );
}
