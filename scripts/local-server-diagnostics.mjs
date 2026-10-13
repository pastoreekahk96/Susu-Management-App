// Return fixed categories only. Never return source lines, messages, paths or URLs.
export function classifyLocalServerLine(line) {
  const categories=[];
  if (/Group current-week page read failed/.test(line)) categories.push('group-page-read-failed');
  if (/Group current-week read failed/.test(line)) categories.push('group-api-read-failed');
  if (/PrismaClientInitializationError/.test(line)) categories.push('prisma-initialization');
  if (/PrismaClientKnownRequestError/.test(line)) categories.push('prisma-request');
  if (/PrismaClientValidationError/.test(line)) categories.push('prisma-validation');
  if (/Can't reach database server|Authentication failed against database server|Timed out fetching a new connection/.test(line)) categories.push('database-connection');
  if (/Module not found|Cannot find module|Failed to compile/.test(line)) categories.push('compile-or-module');
  if (/Error:|TypeError:|ReferenceError:|SyntaxError:/.test(line)) categories.push('server-error');
  return categories;
}

export function createLocalServerDiagnostics() {
  const counts={};
  const tails={stdout:'',stderr:''};
  return {
    accept(stream,chunk) {
      // Keep at most one bounded partial line privately; it is never reported.
      const lines=(tails[stream]+chunk.toString()).split('\n');
      tails[stream]=lines.pop().slice(-4096);
      for (const line of lines) for (const category of classifyLocalServerLine(line)) counts[category]=(counts[category]??0)+1;
    },
    summary() {
      const result={...counts};
      for (const tail of Object.values(tails)) for (const category of classifyLocalServerLine(tail)) result[category]=(result[category]??0)+1;
      return result;
    },
  };
}
