type SessionIdentity<User> = { expiresAt: Date; user: User };

// Session reads must work during Server Component rendering. Cookie and database
// cleanup belongs to mutation routes, not this authentication read path.
export function createSessionReader<User>(dependencies: {
  getToken: () => Promise<string | undefined>;
  findSession: (token: string) => Promise<SessionIdentity<User> | null>;
  now?: () => Date;
}) {
  return async function getCurrentUser(): Promise<User | null> {
    const token = await dependencies.getToken();
    if (!token) return null;

    const session = await dependencies.findSession(token);
    if (!session) return null;

    const expiresAt = session.expiresAt.getTime();
    const now = (dependencies.now?.() ?? new Date()).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

    return session.user;
  };
}
