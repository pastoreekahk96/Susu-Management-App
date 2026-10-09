import { execFileSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { verifyRehearsalTarget } from './rehearsal-target.mjs';

const userId = 'susu-preview-viewer';
const groupId = 'susu-preview-empty-group';
const membershipId = 'susu-preview-viewer-membership';
const email = 'preview@susu.local';
const tables = ['User', 'Session', 'Group', 'GroupMembership', 'Member', 'Cycle', 'CycleMember', 'CycleHand', 'Week', 'DailyPayment', 'Payout', 'AuditLog'];

async function main() {
  const remove = process.argv.length === 3 && process.argv[2] === '--remove';
  if (process.argv.length !== 2 && !remove) throw Error('INVALID_ARGUMENTS');
  verifyRehearsalTarget(execFileSync('git', ['branch', '--show-current']).toString().trim(), process.env);
  const password = process.env.SUSU_PREVIEW_PASSWORD;
  if (!remove && (typeof password !== 'string' || password.length < 12 || password.length > 256)) throw Error('PASSWORD_MUST_BE_12_TO_256_CHARACTERS');
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_UNPOOLED });
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(table => `"${table}"`).join(', ')}, "LoginAttempt" IN SHARE ROW EXCLUSIVE MODE`);
      const loginBaseline = JSON.stringify(await tx.loginAttempt.findMany({ orderBy: { id: 'asc' } }));
      if (remove) {
        const user = await tx.user.findUnique({ where: { id: userId } });
        const group = await tx.group.findUnique({ where: { id: groupId } });
        if (!user || user.email !== email || user.role !== 'VIEWER' || user.name !== 'Preview Viewer' || !group || group.name !== 'Preview group') throw Error('PREVIEW_IDENTITY_MISMATCH');
        for (const table of tables.filter(table => !['User', 'Session', 'Group', 'GroupMembership'].includes(table))) {
          const [row] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
          if (row.count !== 0) throw Error('PREVIEW_HAS_RECORDS_REMOVE_REFUSED');
        }
        const memberships = await tx.groupMembership.findMany();
        if (memberships.length !== 1 || memberships[0].id !== membershipId || memberships[0].userId !== userId || memberships[0].groupId !== groupId || memberships[0].role !== 'OPERATOR') throw Error('PREVIEW_IDENTITY_MISMATCH');
        if (await tx.user.count() !== 1 || await tx.group.count() !== 1 || await tx.session.count({ where: { userId: { not: userId } } }) !== 0) throw Error('STAGING_HAS_OTHER_RECORDS');
        await tx.session.deleteMany({ where: { userId } });
        await tx.groupMembership.delete({ where: { id: membershipId } });
        await tx.group.delete({ where: { id: groupId } });
        await tx.user.delete({ where: { id: userId } });
      } else {
        for (const table of tables) {
          const [row] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
          if (row.count !== 0) throw Error('STAGING_NOT_EMPTY');
        }
        const salt = randomBytes(16).toString('hex');
        const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
        await tx.user.create({ data: { id: userId, name: 'Preview Viewer', email, role: 'VIEWER', passwordHash } });
        await tx.group.create({ data: { id: groupId, name: 'Preview group' } });
        await tx.groupMembership.create({ data: { id: membershipId, userId, groupId, role: 'OPERATOR' } });
      }
      if (JSON.stringify(await tx.loginAttempt.findMany({ orderBy: { id: 'asc' } })) !== loginBaseline) throw Error('LOGIN_ATTEMPTS_CHANGED');
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    console.log(remove ? 'PASS: preview account and empty group removed.' : 'PASS: preview viewing account created: preview@susu.local');
    if (!remove) console.log('Select Preview group on Members or Current week. No members or financial records were created. Remove preview access before empty-database tests.');
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  const safe = ['INVALID_ARGUMENTS', 'WRONG_BRANCH', 'WRONG_DATABASE_TARGET', 'PASSWORD_MUST_BE_12_TO_256_CHARACTERS', 'PREVIEW_IDENTITY_MISMATCH', 'PREVIEW_HAS_RECORDS_REMOVE_REFUSED', 'STAGING_HAS_OTHER_RECORDS', 'STAGING_NOT_EMPTY', 'LOGIN_ATTEMPTS_CHANGED'];
  console.error('Preview access stopped:', safe.includes(error.message) ? error.message : 'DATABASE_ERROR');
  process.exitCode = 1;
});
