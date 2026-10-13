// Display readiness only. The completion API repeats all checks in its transaction.
export function groupWeekReadiness(members: { payments: {
  dayIndex: number; expectedAmount: number; paidAmount: number; status: string;
}[] }[], days: number, endDate: string | Date, now: Date): string | null {
  const end = new Date(endDate);
  const boundary = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) + 86400000;
  if (!Number.isFinite(boundary) || now.getTime() < boundary) return "Wait until Sunday has ended, then reload this page.";
  if (!members.length || !Number.isSafeInteger(days) || days < 1 || days > 7 || members.some(member => {
    const slots = new Set<number>();
    return member.payments.length !== days || member.payments.some(payment => {
      const duplicate = slots.has(payment.dayIndex); slots.add(payment.dayIndex);
      return duplicate || !Number.isInteger(payment.dayIndex) || payment.dayIndex < 0 || payment.dayIndex >= days ||
        payment.status !== "PAID" || !Number.isSafeInteger(payment.expectedAmount) || payment.expectedAmount <= 0 ||
        payment.paidAmount !== payment.expectedAmount;
    });
  })) return "Save full payments for every member and contribution day before completing this week.";
  return null;
}
