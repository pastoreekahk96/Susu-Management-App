import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import MemberManager from "./member-manager";

export default async function MembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Members</h1>
          <p className="muted">
            Manage the master member register without changing the frozen active-cycle snapshot.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href="/">Dashboard</a>
          <a className="button secondary" href="/current-week">Current week</a>
          <a className="button secondary" href="/payouts">Payouts</a>
        </div>
      </header>

      <section className="rule member-management-note">
        <strong>Cycle protection:</strong> changing a member's name or active status here does not
        rewrite this cycle's snapshot. New members are master records only until a future cycle is created.
      </section>

      <MemberManager isAdmin={user.role === "ADMIN"} />
    </main>
  );
}
