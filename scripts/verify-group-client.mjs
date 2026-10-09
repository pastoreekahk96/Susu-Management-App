export function verifyGroupClient(models) {
  for (const name of ["Group", "GroupMembership", "Member", "Cycle", "Session", "LoginAttempt"]) {
    const model = models?.find(model => model.name === name);
    if (!model || (["Member", "Cycle"].includes(name) && !model.fields.some(field => field.name === "groupId"))) {
      throw new Error("STALE_PRISMA_CLIENT_RUN_GENERATE");
    }
  }
}
