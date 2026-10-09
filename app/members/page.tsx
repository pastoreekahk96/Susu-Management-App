import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import MemberManager from "./member-manager";
import ThemeToggle from "../theme-toggle";
import { prisma } from "../../lib/prisma";
import { memberGroupSelection } from "../../lib/member-group-selection";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ group?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "ADMIN", "OPERATOR"] } },
    select: { groupId: true, role: true, group: { select: { name: true } } },
    orderBy: { group: { name: "asc" } },
  });
  const { group: requested } = await searchParams;
  const selection = memberGroupSelection(memberships, requested);
  const selected = selection.mode === "group" ? selection.selected : undefined;
  const invalidGroup = selection.mode === "denied";
  const chooseGroup = selection.mode === "choose";


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
          <ThemeToggle />
          <Link className="button secondary" href="/">Dashboard</Link>
          <Link className="button secondary" href={selected ? `/current-week?group=${encodeURIComponent(selected.groupId)}` : "/current-week"}>Current week</Link>
          <Link className="button secondary" href="/payouts">Payouts</Link>
        </div>
      </header>

      <section className="rule member-management-note">
        <strong>Cycle protection:</strong> changing a member&apos;s name or active status here does not
        rewrite this cycle&apos;s snapshot. New members are master records only until a future cycle is created.
      </section>

      {memberships.length > 0 ? (
        <section className="card">
          <form action="/members" method="get" className="member-add-form">
            <label>
              <span>Group</span>
              <select name="group" defaultValue={selected?.groupId ?? ""} required>
                <option value="" disabled>Select a group</option>
                {memberships.map(m => <option key={m.groupId} value={m.groupId}>{m.group.name}</option>)}
              </select>
            </label>
            <button className="button" type="submit">Open group</button>
          </form>
        </section>
      ) : null}
      {invalidGroup ? (
        <section className="card"><p role="alert" className="error">You do not have staff access to this group.</p></section>
      ) : chooseGroup ? (
        <section className="card"><p className="muted">Select a group to view its member register.</p></section>
      ) : selected ? (
        <>
          <section className="card"><h2>{selected.group.name}</h2><p className="muted">Your group role: {selected.role.toLowerCase()}</p></section>
          <MemberManager key={selected.groupId} groupId={selected.groupId} isAdmin={selected.role === "OWNER" || selected.role === "ADMIN"} />
        </>
      ) : (
        <MemberManager isAdmin={user.role === "ADMIN"} />
      )}
    </main>
  );
}
