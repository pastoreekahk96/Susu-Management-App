import type { GroupRole, PrismaClient } from "@prisma/client";
import { validateSameOrigin } from "./security";

type Authorize = (groupId: string, role: GroupRole) => Promise<{ userId: string; groupId: string }>;
type Context = { params: Promise<{ groupId: string }> };

export function createGroupPaymentWriter(
  db: PrismaClient,
  authorize: Authorize,
  getSessionTokenHash: () => Promise<string | null>,
) {
  return async (request: Request, { params }: Context) => {
    if (!validateSameOrigin(request)) return Response.json({ error: "Cross-origin request blocked." }, { status: 403 });
    try {
      const actor = await authorize((await params).groupId, "OPERATOR");
      const tokenHash = await getSessionTokenHash();
      if (!tokenHash) throw new Error("AUTH_REQUIRED");
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["paymentId", "amount"].includes(key))) {
        return Response.json({ error: "Invalid payment fields." }, { status: 400 });
      }
      const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
      const amount = body.amount;
      if (!paymentId || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
        return Response.json({ error: "Payment ID and a nonnegative whole-number amount of LD are required." }, { status: 400 });
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const updated = await db.$transaction(async tx => {
            const session = await tx.session.findFirst({ where: {
              tokenHash, userId: actor.userId, expiresAt: { gt: new Date() },
            }, select: { id: true } });
            if (!session) throw new Error("AUTH_REQUIRED");
            const membership = await tx.groupMembership.findFirst({ where: {
              userId: actor.userId, groupId: actor.groupId, role: { in: ["OWNER", "ADMIN", "OPERATOR"] },
            }, select: { id: true } });
            if (!membership) throw new Error("FORBIDDEN");
            // Scope BOTH paths before reading financial details. The schema's two
            // foreign keys do not guarantee that week and snapshot share a cycle.
            const payment = await tx.dailyPayment.findFirst({ where: {
              id: paymentId,
              week: { cycle: { groupId: actor.groupId } },
              cycleMember: { cycle: { groupId: actor.groupId } },
            }, include: { week: { include: { cycle: true } }, cycleMember: true } });
            if (!payment || payment.week.cycleId !== payment.cycleMember.cycleId) throw new Error("PAYMENT_NOT_FOUND");
            if (payment.week.status !== "OPEN" || payment.week.cycle.status !== "ACTIVE") throw new Error("PAYMENT_CLOSED");
            if (amount > payment.expectedAmount) throw new Error("EXCESSIVE_AMOUNT");
            const status = amount === 0 ? "UNPAID" : amount === payment.expectedAmount ? "PAID" : "PARTIAL";
            // Absolute recorded amount, matching the legacy behavior. Serializable
            // retries read a fresh before-image and never double-add contributions.
            const result = await tx.dailyPayment.update({ where: { id: payment.id }, data: {
              paidAmount: amount, status, paidAt: amount > 0 ? new Date() : null, recordedById: actor.userId,
            } });
            const snapshot = (row: typeof result) => JSON.stringify({
              paidAmount: row.paidAmount, status: row.status, groupId: actor.groupId,
              cycleId: payment.week.cycleId, weekId: row.weekId, cycleMemberId: row.cycleMemberId,
            });
            await tx.auditLog.create({ data: {
              actorId: actor.userId, action: "UPDATE_DAILY_PAYMENT", entityType: "DailyPayment", entityId: payment.id,
              beforeJson: snapshot(payment), afterJson: snapshot(result),
            } });
            return { id: result.id, paidAmount: result.paidAmount, status: result.status, paidAt: result.paidAt };
          }, { isolationLevel: "Serializable" });
          return Response.json(updated);
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034" && attempt < 2) continue;
          throw error;
        }
      }
      throw new Error("PAYMENT_UPDATE_FAILED");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401 });
      if (message === "FORBIDDEN") return Response.json({ error: "Group staff access required." }, { status: 403 });
      if (message === "PAYMENT_NOT_FOUND") return Response.json({ error: "Payment record not found." }, { status: 404 });
      if (message === "PAYMENT_CLOSED") return Response.json({ error: "This payment is no longer editable." }, { status: 409 });
      if (message === "EXCESSIVE_AMOUNT") return Response.json({ error: "Payment cannot exceed the daily amount due." }, { status: 400 });
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
        return Response.json({ error: "Concurrent change. Please retry." }, { status: 409 });
      }
      console.error("Group payment write failed");
      return Response.json({ error: "Unable to save the payment." }, { status: 500 });
    }
  };
}
