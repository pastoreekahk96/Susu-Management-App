import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
    const rawAmount = body.amount;

    if (!paymentId || rawAmount === undefined || rawAmount === null || rawAmount === "") {
      return NextResponse.json({ error: "Payment ID and amount are required." }, { status: 400 });
    }

    const amount = Number(rawAmount);

    if (!Number.isInteger(amount) || amount < 0) {
      return NextResponse.json({ error: "Amount must be a whole number of LD and cannot be negative." }, { status: 400 });
    }

    const payment = await prisma.dailyPayment.findUnique({
      where: { id: paymentId },
      include: {
        week: true,
        cycleMember: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment record not found." }, { status: 404 });
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
            paidAmount: payment.paidAmount,
            status: payment.status,
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
    console.error("Failed to update daily payment", error);
    return NextResponse.json({ error: "Unable to save the payment." }, { status: 500 });
  }
}
