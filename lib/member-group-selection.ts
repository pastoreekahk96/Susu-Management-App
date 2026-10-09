import type { GroupRole } from "@prisma/client";
type StaffGroup = { groupId: string; role: GroupRole; group: { name: string } };

export function memberGroupSelection(groups: StaffGroup[], requested: string | string[] | undefined) {
  const selected = typeof requested === "string" ? groups.find(group => group.groupId === requested) : undefined;
  if (requested !== undefined && !selected) return { mode: "denied" as const };
  if (selected) return { mode: "group" as const, selected, canEdit: selected.role === "OWNER" || selected.role === "ADMIN" };
  if (groups.length > 0) return { mode: "choose" as const };
  return { mode: "legacy" as const };
}
