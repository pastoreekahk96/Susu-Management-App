export function verifyRehearsalTarget(branch, environment) {
  if (branch !== "advanced-susu-management-upgrade") throw new Error("WRONG_BRANCH");
  const hosts = {
    DATABASE_URL: "ep-shiny-snow-b75mtlqx-pooler.c-13.us-east-1.aws.neon.tech",
    DATABASE_URL_UNPOOLED: "ep-shiny-snow-b75mtlqx.c-13.us-east-1.aws.neon.tech",
  };
  for (const [key, host] of Object.entries(hosts)) {
    let url;
    try { url = new URL(environment[key]); } catch { throw new Error("WRONG_DATABASE_TARGET"); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host ||
        url.pathname !== '/neondb' || (url.port && url.port !== '5432') ||
        (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
      throw new Error("WRONG_DATABASE_TARGET");
    }
  }
}
