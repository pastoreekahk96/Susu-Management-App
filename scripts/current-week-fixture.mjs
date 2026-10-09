export async function createCurrentWeekFixture(tx, ids) {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  await tx.cycle.update({ where: { id: ids.cycleA }, data: { status: 'ACTIVE', startDate: start } });
  for (const suffix of ['A', 'B']) {
    await tx.week.create({ data: { id: ids[`week${suffix}`], cycleId: ids[`cycle${suffix}`], weekNumber: 1, startDate: start, endDate: end } });
    await tx.cycleMember.create({ data: { id: ids[`snapshot${suffix}`], cycleId: ids[`cycle${suffix}`], memberId: ids[`member${suffix}`], nameSnapshot: `Synthetic frozen ${suffix}`, handsCount: 2 } });
    await tx.dailyPayment.create({ data: { id: ids[`payment${suffix}`], weekId: ids[`week${suffix}`], cycleMemberId: ids[`snapshot${suffix}`], paymentDate: start, dayIndex: 0, expectedAmount: 100, paidAmount: suffix === 'A' ? 20 : 75, status: 'PARTIAL' } });
  }
}

export async function removeCurrentWeekFixture(tx, ids) {
  // Exact fixture IDs and parent relationships only; never delete arbitrary cycle contents.
  for (const suffix of ['A', 'B']) {
    await tx.dailyPayment.deleteMany({ where: { id: ids[`payment${suffix}`], weekId: ids[`week${suffix}`], cycleMemberId: ids[`snapshot${suffix}`] } });
    await tx.cycleMember.deleteMany({ where: { id: ids[`snapshot${suffix}`], cycleId: ids[`cycle${suffix}`], memberId: ids[`member${suffix}`], payments: { none: {} }, hands: { none: {} } } });
    await tx.week.deleteMany({ where: { id: ids[`week${suffix}`], cycleId: ids[`cycle${suffix}`], payments: { none: {} }, payout: null } });
  }
  await tx.cycle.update({ where: { id: ids.cycleA }, data: { status: 'COMPLETED' } });
}
