import { randomInt } from "node:crypto";
import type { GroupRole, PrismaClient } from "@prisma/client";
import { validateSameOrigin } from "./security";

type Authorize = (groupId: string, role: GroupRole) => Promise<{ userId: string; groupId: string }>;
type Context = { params: Promise<{ groupId: string }> };
const headers = { "Cache-Control": "private, no-store" };
const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export function createGroupPayoutSelector(
  db: PrismaClient,
  authorize: Authorize,
  getSessionTokenHash: () => Promise<string | null>,
  now: () => Date = () => new Date(),
  chooseIndex: (size: number) => number = randomInt,
) {
  return async (request: Request, { params }: Context) => {
    if (!validateSameOrigin(request)) return Response.json({ error: "Cross-origin request blocked." }, { status: 403, headers });
    try {
      const actor = await authorize((await params).groupId, "ADMIN");
      const tokenHash = await getSessionTokenHash();
      if (!tokenHash) throw new Error("AUTH_REQUIRED");
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["weekId", "method", "memberId", "reason"].includes(key)) ||
        typeof body.weekId !== "string" || !body.weekId.trim() || !["RANDOM", "MANUAL"].includes(body.method)) {
        return Response.json({ error: "A valid week ID and RANDOM or MANUAL method are required." }, { status: 400, headers });
      }
      const weekId = body.weekId.trim();
      const method: "RANDOM" | "MANUAL" = body.method;
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if ((method === "RANDOM" && (Object.hasOwn(body, "memberId") || Object.hasOwn(body, "reason"))) ||
        (method === "MANUAL" && (!memberId || !reason || reason.length > 500))) {
        return Response.json({ error: "Manual selection requires a member and reason up to 500 characters; RANDOM accepts neither." }, { status: 400, headers });
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await db.$transaction(async tx => {
            const time = now();
            const session = await tx.session.findFirst({ where: { tokenHash, userId: actor.userId, expiresAt: { gt: time } }, select: { id: true } });
            if (!session) throw new Error("AUTH_REQUIRED");
            const membership = await tx.groupMembership.findFirst({ where: {
              userId: actor.userId, groupId: actor.groupId, role: { in: ["OWNER", "ADMIN"] },
            }, select: { id: true } });
            if (!membership) throw new Error("FORBIDDEN");
            const week = await tx.week.findFirst({ where: { id: weekId, cycle: { groupId: actor.groupId } }, include: { cycle: true } });
            if (!week) throw new Error("WEEK_NOT_FOUND");
            if (week.status !== "ELIGIBLE" || week.cycle.status !== "ACTIVE") throw new Error("WEEK_NOT_ELIGIBLE");
            if (utcDay(time) < utcDay(week.endDate) + 86400000) throw new Error("WEEK_TOO_EARLY");
            if (await tx.payout.findUnique({ where: { weekId }, select: { id: true } })) throw new Error("PAYOUT_EXISTS");
            const cycle = week.cycle;
            const members = await tx.cycleMember.findMany({ where: { cycleId: week.cycleId, cycle: { groupId: actor.groupId } },
              select: { id: true, handsCount: true } });
            // Inspect all hands in the cycle rather than hiding inconsistent links
            // in a pending-only query. One hand remains the unit of selection.
            const hands = await tx.cycleHand.findMany({ where: { cycleId: week.cycleId }, orderBy: { handNumber: "asc" }, select: {
              id: true, handNumber: true, status: true, cycleMemberId: true,
              cycleMember: { select: { cycleId: true, nameSnapshot: true } },
              payout: { select: { amount: true, week: { select: { cycleId: true, status: true } } } },
            } });
            const memberCounts = new Map(members.map(member => [member.id, 0]));
            const numbers = new Set<number>();
            if (!members.length || !Number.isSafeInteger(cycle.totalHandsSnapshot) || cycle.totalHandsSnapshot <= 0 ||
              cycle.contributionPerHandDay !== 50 || cycle.daysPerWeek !== 7 || cycle.numberOfWeeks !== cycle.totalHandsSnapshot ||
              !Number.isSafeInteger(cycle.weeklyPayoutAmount) || cycle.weeklyPayoutAmount !== cycle.totalHandsSnapshot * 50 * 7 ||
              !Number.isSafeInteger(week.weekNumber) || week.weekNumber < 1 || week.weekNumber > cycle.numberOfWeeks ||
              members.some(member => !Number.isSafeInteger(member.handsCount) || member.handsCount <= 0) ||
              members.reduce((sum, member) => sum + member.handsCount, 0) !== cycle.totalHandsSnapshot || hands.length !== cycle.totalHandsSnapshot) {
              throw new Error("CYCLE_HANDS_INVALID");
            }
            for (const hand of hands) {
              if (!memberCounts.has(hand.cycleMemberId) || hand.cycleMember.cycleId !== week.cycleId ||
                !Number.isInteger(hand.handNumber) || hand.handNumber < 1 || hand.handNumber > cycle.totalHandsSnapshot || numbers.has(hand.handNumber) ||
                (hand.status === "PENDING" && hand.payout !== null) ||
                (hand.status === "SELECTED" && (!hand.payout || hand.payout.week.cycleId !== week.cycleId ||
                  hand.payout.week.status !== "PAID" || hand.payout.amount !== cycle.weeklyPayoutAmount)) ||
                !["PENDING", "SELECTED"].includes(hand.status)) throw new Error("CYCLE_HANDS_INVALID");
              numbers.add(hand.handNumber);
              memberCounts.set(hand.cycleMemberId, memberCounts.get(hand.cycleMemberId)! + 1);
            }
            if (members.some(member => memberCounts.get(member.id) !== member.handsCount)) throw new Error("CYCLE_HANDS_INVALID");
            const payments = await tx.dailyPayment.findMany({ where: { weekId: week.id }, select: {
              cycleMemberId: true, dayIndex: true, expectedAmount: true, paidAmount: true, status: true,
              cycleMember: { select: { cycleId: true } },
            } });
            const dues = new Map(members.map(member => [member.id, member.handsCount * 50]));
            const slots = new Set<string>();
            if (payments.length !== members.length * 7) throw new Error("WEEK_PAYMENTS_INVALID");
            for (const payment of payments) {
              const slot = `${payment.cycleMemberId}:${payment.dayIndex}`;
              if (!dues.has(payment.cycleMemberId) || payment.cycleMember.cycleId !== week.cycleId ||
                !Number.isInteger(payment.dayIndex) || payment.dayIndex < 0 || payment.dayIndex > 6 || slots.has(slot) ||
                payment.expectedAmount !== dues.get(payment.cycleMemberId) || payment.paidAmount !== payment.expectedAmount ||
                payment.status !== "PAID") throw new Error("WEEK_PAYMENTS_INVALID");
              slots.add(slot);
            }
            if (method === "MANUAL" && !memberCounts.has(memberId)) throw new Error("MEMBER_NOT_FOUND");
            const pending = hands.filter(hand => hand.status === "PENDING" && (method === "RANDOM" || hand.cycleMemberId === memberId));
            if (!pending.length) throw new Error("NO_PENDING_HANDS");
            const index = chooseIndex(pending.length);
            if (!Number.isInteger(index) || index < 0 || index >= pending.length) throw new Error("SELECTION_FAILED");
            const selected = pending[index];
            const marked = await tx.cycleHand.updateMany({ where: {
              id: selected.id, cycleId: week.cycleId, cycleMemberId: selected.cycleMemberId, status: "PENDING", payout: null,
            }, data: { status: "SELECTED" } });
            if (marked.count !== 1) throw new Error("CONCURRENT_CHANGE");
            const payout = await tx.payout.create({ data: {
              weekId: week.id, handId: selected.id, amount: cycle.weeklyPayoutAmount, selectionMethod: method,
              manualReason: method === "MANUAL" ? reason : null, status: "DRAWN", recordedById: actor.userId,
            } });
            const updated = await tx.week.updateMany({ where: {
              id: week.id, cycleId: week.cycleId, status: "ELIGIBLE", cycle: { groupId: actor.groupId, status: "ACTIVE" },
            }, data: { status: "PAID" } });
            if (updated.count !== 1) throw new Error("CONCURRENT_CHANGE");
            const scope = { groupId: actor.groupId, cycleId: week.cycleId, weekId: week.id, weekNumber: week.weekNumber };
            await tx.auditLog.create({ data: {
              actorId: actor.userId, action: method === "RANDOM" ? "RANDOM_PAYOUT" : "MANUAL_PAYOUT", entityType: "Payout", entityId: payout.id,
              beforeJson: JSON.stringify({ ...scope, weekStatus: "ELIGIBLE", handId: selected.id, handStatus: "PENDING" }),
              afterJson: JSON.stringify({ ...scope, payoutId: payout.id, handId: selected.id, handNumber: selected.handNumber,
                cycleMemberId: selected.cycleMemberId, memberName: selected.cycleMember.nameSnapshot, amount: payout.amount,
                selectionMethod: payout.selectionMethod, manualReason: payout.manualReason, payoutStatus: "DRAWN", weekStatus: "PAID", handStatus: "SELECTED" }),
            } });
            return { id: payout.id, weekId: week.id, weekNumber: week.weekNumber, handId: selected.id, handNumber: selected.handNumber,
              memberName: selected.cycleMember.nameSnapshot, amount: payout.amount, selectionMethod: payout.selectionMethod,
              manualReason: payout.manualReason, status: payout.status, drawnAt: payout.drawnAt };
          }, { isolationLevel: "Serializable" });
          return Response.json(result, { headers });
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034" && attempt < 2) continue;
          throw error;
        }
      }
      throw new Error("SELECTION_FAILED");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const errors: Record<string, [number, string]> = {
        AUTH_REQUIRED: [401, "Authentication required."], FORBIDDEN: [403, "Group administrator access required."],
        WEEK_NOT_FOUND: [404, "Week not found."], MEMBER_NOT_FOUND: [404, "Member not found in this cycle."],
        WEEK_NOT_ELIGIBLE: [409, "This week is not eligible for a payout."], WEEK_TOO_EARLY: [409, "The Sunday contribution day must finish first."],
        PAYOUT_EXISTS: [409, "A payout already exists for this week."], NO_PENDING_HANDS: [409, "No remaining pending hand is available for this selection."],
        CYCLE_HANDS_INVALID: [409, "The frozen cycle hand records are inconsistent. Review before selecting a payout."],
        WEEK_PAYMENTS_INVALID: [409, "The eligible week does not have consistent fully paid contribution records."],
        CONCURRENT_CHANGE: [409, "The week or hand changed. Reload before trying again."],
      };
      if (errors[code]) return Response.json({ error: errors[code][1] }, { status: errors[code][0], headers });
      if (typeof error === "object" && error !== null && "code" in error && ["P2034", "P2002"].includes(String(error.code))) {
        return Response.json({ error: "Concurrent or existing payout. Reload before trying again." }, { status: 409, headers });
      }
      console.error("Group payout selection failed");
      return Response.json({ error: "Unable to record the group payout." }, { status: 500, headers });
    }
  };
}
