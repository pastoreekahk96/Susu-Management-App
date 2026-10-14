import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import GroupPayoutPage from "./group-payout-page";
import PayoutPanel from "./payout-panel";
import ThemeToggle from "../theme-toggle";

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ group?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { group: requested } = await searchParams;
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "ADMIN", "OPERATOR"] } },
    select: { groupId: true, role: true, group: { select: { name: true } } }, orderBy: { group: { name: "asc" } },
  });
  if (memberships.length > 0 || requested !== undefined) return <GroupPayoutPage memberships={memberships} requested={requested} />;
  if (user.role !== "ADMIN") redirect("/");

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
          <ThemeToggle />
          <Link className="button secondary" href="/current-week">Current week</Link>
          <Link className="button secondary" href="/">Dashboard</Link>
        </div>
      </header>

      <PayoutPanel />

      <section className="rule">
        <strong>Locked payout rule:</strong> one hand is paid per eligible week. A member with
        multiple hands receives only one hand in a single weekly payout. Every payout is recorded
        with its method and audit information.
      </section>
    </main>
  );
}
