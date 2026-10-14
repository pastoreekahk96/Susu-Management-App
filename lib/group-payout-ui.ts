export type PayoutWeekOption = { id: string; weekNumber: number; startDate: string; endDate: string; amount: number };
export type PayoutMemberOption = { id: string; name: string; pendingHands: number };
export type GroupPayoutOptions = { weeks: PayoutWeekOption[]; members: PayoutMemberOption[] };
export type ConfirmedGroupPayout = { id: string; weekId: string; weekNumber: number; handId: string; handNumber: number;
  memberName: string; amount: number; selectionMethod: "RANDOM" | "MANUAL"; manualReason: string | null; status: "DRAWN"; drawnAt: string };

export function isConfirmedGroupPayout(data: unknown, week: PayoutWeekOption, method: "RANDOM" | "MANUAL",
  members: PayoutMemberOption[], memberId: string, reason: string): data is ConfirmedGroupPayout {
  if (!data || typeof data !== "object") return false;
  const result = data as Partial<ConfirmedGroupPayout>;
  const member = members.find(candidate => candidate.name === result.memberName && candidate.pendingHands > 0 &&
    (method === "RANDOM" || candidate.id === memberId));
  return typeof result.id === "string" && !!result.id && result.weekId === week.id && result.weekNumber === week.weekNumber &&
    typeof result.handId === "string" && !!result.handId && Number.isSafeInteger(result.handNumber) && result.handNumber! > 0 &&
    !!member && result.amount === week.amount && result.selectionMethod === method && result.status === "DRAWN" &&
    result.manualReason === (method === "MANUAL" ? reason.trim() : null) && typeof result.drawnAt === "string" && Number.isFinite(Date.parse(result.drawnAt));
}

export function groupPayoutConfirmation(week: PayoutWeekOption, method: "RANDOM" | "MANUAL", member: PayoutMemberOption | undefined, reason: string) {
  return [
    `Record ${method === "MANUAL" ? "manual selection" : "random draw"} for Week #${week.weekNumber}?`,
    ...(method === "MANUAL" ? [`Member: ${member?.name ?? "Unknown member"}`, `Reason: ${reason.trim()}`] : []),
    "Exactly one remaining hand will be selected.", `Amount: ${week.amount.toLocaleString()} LD`,
    "This records the selection permanently. Cash collection is confirmed separately.",
  ].join("\n");
}
