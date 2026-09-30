import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const members = [
  ["Kumba Fayah", 4],
  ["Daniel Moore", 1],
  ["Abraham Tarplah", 1],
  ["Randall Blakepeh", 1],
  ["Deborah Tokpah", 2],
  ["Kumbah Ukaegbu", 10],
  ["Wisdom Tarplah", 2],
  ["Cecelia Ukaegbu", 3],
  ["Judith Idee", 2],
  ["Bendu Garseeda", 2],
  ["Maron Dahn", 4],
  ["Christina", 2],
  ["Fallah Fayiah", 4],
  ["P. Arthur", 5],
  ["Rachel Fayiah", 4]
] as const;

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function main() {
  const contributionPerHandDay = 50;
  const daysPerWeek = 7;
  const numberOfWeeks = 47;
  const startDate = new Date("2026-09-14T00:00:00.000Z");
  const totalHands = members.reduce((sum, [, hands]) => sum + hands, 0);
  const weeklyPayoutAmount = totalHands * contributionPerHandDay * daysPerWeek;

  const user = await prisma.user.upsert({
    where: { email: "admin@susu.local" },
    update: {},
    create: { name: "SUSU Administrator", email: "admin@susu.local", role: "ADMIN" }
  });

  const cycle = await prisma.cycle.create({
    data: {
      name: "SUSU Cycle 2026/2027",
      startDate,
      numberOfWeeks,
      contributionPerHandDay,
      daysPerWeek,
      totalHandsSnapshot: totalHands,
      weeklyPayoutAmount
    }
  });

  let handNumber = 1;

  for (const [name, handsCount] of members) {
    const member = await prisma.member.create({ data: { name } });
    const cycleMember = await prisma.cycleMember.create({
      data: { cycleId: cycle.id, memberId: member.id, nameSnapshot: name, handsCount }
    });

    for (let i = 1; i <= handsCount; i++) {
      await prisma.cycleHand.create({
        data: {
          cycleId: cycle.id,
          cycleMemberId: cycleMember.id,
          handNumber: handNumber++
        }
      });
    }
  }

  for (let weekNumber = 1; weekNumber <= numberOfWeeks; weekNumber++) {
    const weekStart = addDays(startDate, (weekNumber - 1) * 7);
    const weekEnd = addDays(weekStart, 6);

    const week = await prisma.week.create({
      data: {
        cycleId: cycle.id,
        weekNumber,
        startDate: weekStart,
        endDate: weekEnd
      }
    });

    const cycleMembers = await prisma.cycleMember.findMany({
      where: { cycleId: cycle.id }
    });

    for (const cycleMember of cycleMembers) {
      const expectedAmount = cycleMember.handsCount * contributionPerHandDay;

      for (let dayIndex = 0; dayIndex < daysPerWeek; dayIndex++) {
        await prisma.dailyPayment.create({
          data: {
            weekId: week.id,
            cycleMemberId: cycleMember.id,
            paymentDate: addDays(weekStart, dayIndex),
            dayIndex,
            expectedAmount
          }
        });
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "CYCLE_CREATED",
      entityType: "Cycle",
      entityId: cycle.id,
      afterJson: JSON.stringify({
        totalHands,
        members: members.length,
        weeks: numberOfWeeks,
        weeklyPayoutAmount,
        startDate: "2026-09-14",
        firstWeekEnd: "2026-09-20",
        finalWeekEnd: "2027-08-08"
      })
    }
  });

  console.log({
    cycleId: cycle.id,
    members: members.length,
    totalHands,
    weeks: numberOfWeeks,
    dailyCollection: totalHands * contributionPerHandDay,
    weeklyPayoutAmount
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
