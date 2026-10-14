import Link from "next/link";
import type { GroupRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireGroupRole } from "../../lib/group-auth";
import { memberGroupSelection } from "../../lib/member-group-selection";
import { createGroupPayoutOptionsReader } from "../../lib/group-payout-options";
import type { GroupPayoutOptions } from "../../lib/group-payout-ui";
import ThemeToggle from "../theme-toggle";
import GroupPayoutPanel from "./group-payout-panel";

type Membership = { groupId: string; role: GroupRole; group: { name: string } };
export default async function GroupPayoutPage({ memberships, requested }: { memberships: Membership[]; requested: string | string[] | undefined }) {
  const selection = memberGroupSelection(memberships, requested);
  const selected = selection.mode === "group" ? selection.selected : undefined;
  let denied = selection.mode === "denied" || (selection.mode === "group" && !selection.canEdit);
  let failed = false;
  let options: GroupPayoutOptions | undefined;
  if (selected && !denied) {
    try { options = await createGroupPayoutOptionsReader(prisma, requireGroupRole)(selected.groupId); }
    catch (error) {
      if (error instanceof Error && ["AUTH_REQUIRED", "FORBIDDEN"].includes(error.message)) denied = true;
      else { failed = true; console.error("Group payout page read failed"); }
    }
  }
  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">SUSU MANAGEMENT</p><h1>Weekly payouts</h1>
      <p className="muted">{selected && !denied ? selected.group.name : "Choose a group to manage its payouts."}</p></div>
      <div className="topbar-actions"><ThemeToggle /><Link className="button secondary" href={selected && !denied ? `/current-week?group=${encodeURIComponent(selected.groupId)}` : "/current-week"}>Current week</Link>
        <Link className="button secondary" href="/">Dashboard</Link></div></header>
    {memberships.length ? <section className="card"><form action="/payouts" method="get" className="member-add-form">
      <label htmlFor="payout-group">Group</label><select id="payout-group" name="group" defaultValue={selected?.groupId ?? ""} required>
        <option value="" disabled>Select a group</option>{memberships.map(m => <option key={m.groupId} value={m.groupId}>{m.group.name}</option>)}
      </select><button className="button" type="submit">Open group</button></form></section> : null}
    {denied ? <section className="card"><p role="alert" className="error">Group administrator access required for payouts.</p></section>
      : failed ? <section className="card"><p role="alert" className="error">Unable to load this group&apos;s payout options. Reload to try again.</p>
        <Link className="button secondary" href={`/payouts?group=${encodeURIComponent(selected!.groupId)}`}>Reload payout options</Link></section>
      : selected && options ? <GroupPayoutPanel key={selected.groupId} groupId={selected.groupId} options={options} />
      : <section className="card"><p>Select a group to view payout options.</p></section>}
    <section className="rule"><strong>Locked payout rule:</strong> one individual hand per eligible week. Multiple hands belonging to one member are selected in separate weeks.</section>
  </main>;
}
