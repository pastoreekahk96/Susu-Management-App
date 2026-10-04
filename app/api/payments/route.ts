import { requireRole } from "../../../lib/auth";
import { NextResponse } from "next/server";
import { validateSameOrigin } from "../../../lib/security";
import { prisma } from "../../../lib/prisma";

export async function PATCH(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  let actorId: string | null = null;

  try {
    const actor = await requireRole("OPERATOR");
    actorId = actor.id;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You are not authorized to perform this action." }, { status: 403 });
    return NextResponse.json({ error: "Authentication check failed." }, { status: 500 });
  }
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
    const rawAmount = body.amount;

    if (!paymentId || rawAmount === undefined || rawAmount === null || rawAmount === "") {
      return NextResponse.json({ error: "Payment ID and amount are required." }, { status: 400 });
    }

    if (typeof rawAmount !== "number" || !Number.isSafeInteger(rawAmount)) {
      return NextResponse.json(
        { error: "Amount must be a whole number of LD." },
        { status: 400 }
      );
    }

    const amount = rawAmount;

    if (amount < 0) {
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

    const status =
      amount === 0 ? "UNPAID" :
      amount === payment.expectedAmount ? "PAID" :
      "PARTIAL";

    let updated;

    for (let retry = 0; retry < 3; retry += 1) {
      try {
        updated = await prisma.$transaction(async (tx) => {
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
              recordedById: actorId,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId,
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
        }, {
          isolationLevel: "Serializable",
        });

        break;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "P2034" && retry < 2) {
          continue;
        }
        throw error;
      }
    }

    if (!updated) {
      throw new Error("PAYMENT_UPDATE_FAILED");
    }

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
