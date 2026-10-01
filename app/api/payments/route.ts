import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
    const rawAmount = body.amount;

    if (!paymentId || rawAmount === undefined || rawAmount === null || rawAmount === "") {
      return NextResponse.json({ error: "Payment ID and amount are required." }, { status: 400 });
    }

    const amount = Number(rawAmount);

    if (!Number.isSafeInteger(amount) || amount < 0) {
      return NextResponse.json(
        { error: "Amount must be a whole number of LD and cannot be negative." },
        { status: 400 }
      );
    }

    const activeCycle = await prisma.cycle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!activeCycle) {
      return NextResponse.json({ error: "There is no active SUSU cycle." }, { status: 409 });
    }

    const payment = await prisma.dailyPayment.findFirst({
      where: {
        id: paymentId,
        week: {
          cycleId: activeCycle.id,
          status: "OPEN",
        },
      },
      include: {
        week: true,
        cycleMember: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Payment record was not found, or this week is no longer open." },
        { status: 404 }
      );
    }

    if (amount > payment.expectedAmount) {
      return NextResponse.json(
        { error: `Payment cannot be more than the daily amount due of ${payment.expectedAmount} LD.` },
        { status: 400 }
      );
    }

    const admin = await prisma.user.findUnique({
      where: { email: "admin@susu.local" },
      select: { id: true },
    });

    const status =
      amount === 0 ? "UNPAID" :
      amount === payment.expectedAmount ? "PAID" :
      "PARTIAL";

    const updated = await prisma.$transaction(async (tx) => {
      const lockedPayment = await tx.dailyPayment.findFirst({
        where: {
          id: paymentId,
          week: {
            cycleId: activeCycle.id,
            status: "OPEN",
          },
        },
      });

      if (!lockedPayment) {
        throw new Error("PAYMENT_CLOSED_OR_MISSING");
      }

      const result = await tx.dailyPayment.update({
        where: { id: paymentId },
        data: {
          paidAmount: amount,
          status,
          paidAt: amount > 0 ? new Date() : null,
          recordedById: admin?.id ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: admin?.id ?? null,
          action: "UPDATE_DAILY_PAYMENT",
          entityType: "DailyPayment",
          entityId: paymentId,
          beforeJson: JSON.stringify({
            paidAmount: lockedPayment.paidAmount,
            status: lockedPayment.status,
          }),
          afterJson: JSON.stringify({
            paidAmount: result.paidAmount,
            status: result.status,
          }),
        },
      });

      return result;
    });

    return NextResponse.json({
      id: updated.id,
      paidAmount: updated.paidAmount,
      status: updated.status,
      paidAt: updated.paidAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_CLOSED_OR_MISSING") {
      return NextResponse.json(
        { error: "This payment can no longer be changed because the week is closed." },
        { status: 409 }
      );
    }

    console.error("Failed to update daily payment", error);
    return NextResponse.json({ error: "Unable to save the payment." }, { status: 500 });
  }
}
