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

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let cycle:
    | {
        name: string;
        status: string;
        totalHandsSnapshot: number;
        weeklyPayoutAmount: number;
        startDate: Date;
        numberOfWeeks: number;
        members: { nameSnapshot: string; handsCount: number }[];
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Community cycle dashboard</h1>
          <p className="muted">
            47-hand cycle · Monday–Sunday contributions · payout after Sunday
          </p>
        </div>
        <div className="topbar-actions">
          <a className="button" href="/current-week">Current week payments</a>
          <a className="button secondary" href="/payouts">Weekly payouts</a>
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
            Add DATABASE_URL to the deployment environment, then run the Prisma
            migration and seed commands. The dashboard will switch from the
            temporary fallback data to the real PostgreSQL records.
          </p>
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
        Sunday is the seventh contribution day. The draw becomes eligible only after
        the week is complete, and exactly one pending hand can be paid for that week.
      </section>
    </main>
  );
}
