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
  const cycleName = "SUSU Cycle 2026/2027";
  const startDate = new Date("2026-09-14T00:00:00.000Z");
  const totalHands = members.reduce((sum, [, hands]) => sum + hands, 0);
  const weeklyPayoutAmount = totalHands * contributionPerHandDay * daysPerWeek;
  const expectedDailyPayments = members.length * numberOfWeeks * daysPerWeek;

  const existingCycle = await prisma.cycle.findFirst({
    where: { name: cycleName }
  });

  if (existingCycle) {
    const [memberCount, handCount, weekCount, paymentCount] = await Promise.all([
      prisma.cycleMember.count({ where: { cycleId: existingCycle.id } }),
      prisma.cycleHand.count({ where: { cycleId: existingCycle.id } }),
      prisma.week.count({ where: { cycleId: existingCycle.id } }),
      prisma.dailyPayment.count({
        where: { week: { cycleId: existingCycle.id } }
      })
    ]);

    if (
      memberCount === members.length &&
      handCount === totalHands &&
      weekCount === numberOfWeeks &&
      paymentCount === expectedDailyPayments
    ) {
      console.log("SUSU cycle already seeded; nothing to do.");
      return;
    }

    throw new Error(
      `Existing SUSU cycle is incomplete (members=${memberCount}, hands=${handCount}, weeks=${weekCount}, payments=${paymentCount}). Refusing to seed over partial data.`
    );
  }

  await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.upsert({
        where: { email: "admin@susu.local" },
        update: {},
        create: {
          name: "SUSU Administrator",
          email: "admin@susu.local",
          role: "ADMIN"
        }
      });

      const cycle = await tx.cycle.create({
        data: {
          name: cycleName,
          startDate,
          numberOfWeeks,
          contributionPerHandDay,
          daysPerWeek,
          totalHandsSnapshot: totalHands,
          weeklyPayoutAmount
        }
      });

      const cycleMembers: Array<{ id: string; handsCount: number }> = [];
      const hands: Array<{
        cycleId: string;
        cycleMemberId: string;
        handNumber: number;
      }> = [];

      let handNumber = 1;

      for (const [name, handsCount] of members) {
        const member = await tx.member.create({ data: { name } });
        const cycleMember = await tx.cycleMember.create({
          data: {
            cycleId: cycle.id,
            memberId: member.id,
            nameSnapshot: name,
            handsCount
          }
        });

        cycleMembers.push({ id: cycleMember.id, handsCount });

        for (let i = 0; i < handsCount; i++) {
          hands.push({
            cycleId: cycle.id,
            cycleMemberId: cycleMember.id,
            handNumber: handNumber++
          });
        }
      }

      await tx.cycleHand.createMany({ data: hands });

      const weeks: Array<{
        id: string;
        weekNumber: number;
        startDate: Date;
        endDate: Date;
      }> = [];

      for (let weekNumber = 1; weekNumber <= numberOfWeeks; weekNumber++) {
        const weekStart = addDays(startDate, (weekNumber - 1) * daysPerWeek);
        const weekEnd = addDays(weekStart, daysPerWeek - 1);

        const week = await tx.week.create({
          data: {
            cycleId: cycle.id,
            weekNumber,
            startDate: weekStart,
            endDate: weekEnd
          }
        });

        weeks.push({
          id: week.id,
          weekNumber,
          startDate: weekStart,
          endDate: weekEnd
        });
      }

      const dailyPayments: Array<{
        weekId: string;
        cycleMemberId: string;
        paymentDate: Date;
        dayIndex: number;
        expectedAmount: number;
      }> = [];

      for (const week of weeks) {
        for (const cycleMember of cycleMembers) {
          const expectedAmount = cycleMember.handsCount * contributionPerHandDay;

          for (let dayIndex = 0; dayIndex < daysPerWeek; dayIndex++) {
            dailyPayments.push({
              weekId: week.id,
              cycleMemberId: cycleMember.id,
              paymentDate: addDays(week.startDate, dayIndex),
              dayIndex,
              expectedAmount
            });
          }
        }
      }

      for (let offset = 0; offset < dailyPayments.length; offset += 1000) {
        await tx.dailyPayment.createMany({
          data: dailyPayments.slice(offset, offset + 1000)
        });
      }

      await tx.auditLog.create({
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
        weeklyPayoutAmount,
        dailyPayments: dailyPayments.length
      });
    },
    {
      timeout: 60000
    }
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
