import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

function dateTime(value: Date) {
  return value.toLocaleString("en-LR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function formatDetails(value: string | null) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default async function AuditPage() {
  try {
    await requireRole("ADMIN");
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") redirect("/login");
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      beforeJson: true,
      afterJson: true,
      createdAt: true,
      actor: { select: { name: true, email: true, role: true } },
    },
  });

  const beforeCount = logs.filter((log) => log.beforeJson).length;
  const afterCount = logs.filter((log) => log.afterJson).length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Audit log</h1>
          <p className="muted">Administrative history of recorded changes and financial actions.</p>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href="/">Dashboard</a>
          <a className="button secondary" href="/reports">Reports</a>
          <a className="button secondary" href="/payouts/history">Payout history</a>
        </div>
      </header>

      <section className="stats">
        <article><span>Recent entries</span><strong>{logs.length}</strong></article>
        <article><span>With before-state</span><strong>{beforeCount}</strong></article>
        <article><span>With after-state</span><strong>{afterCount}</strong></article>
        <article><span>Access</span><strong>Admin</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Recent activity</h2>
            <p className="muted">Newest entries first. This page is read-only.</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="rule">
            <strong>No audit entries yet.</strong> Recorded administrative and financial actions will appear here.
          </div>
        ) : (
          <div className="audit-list">
            {logs.map((log) => {
              const before = formatDetails(log.beforeJson);
              const after = formatDetails(log.afterJson);

              return (
                <article className="audit-row" key={log.id}>
                  <div className="audit-main">
                    <div className="audit-title">
                      <strong>{log.action}</strong>
                      <span className="badge">{log.entityType}</span>
                    </div>
                    <span className="muted">{dateTime(log.createdAt)}</span>
                    <span className="muted">Entity: {log.entityId}</span>
                  </div>

                  <div className="audit-actor">
                    <strong>{log.actor?.name ?? "System"}</strong>
                    <span>{log.actor ? log.actor.email : "No authenticated actor recorded"}</span>
                    {log.actor?.role ? <span>Role: {log.actor.role}</span> : null}
                  </div>

                  {(before || after) ? (
                    <details className="audit-details">
                      <summary>View recorded state</summary>
                      <div className="audit-detail-grid">
                        {before ? (
                          <div>
                            <strong>Before</strong>
                            <pre>{before}</pre>
                          </div>
                        ) : (
                          <div>
                            <strong>Before</strong>
                            <pre>—</pre>
                          </div>
                        )}
                        {after ? (
                          <div>
                            <strong>After</strong>
                            <pre>{after}</pre>
                          </div>
                        ) : (
                          <div>
                            <strong>After</strong>
                            <pre>—</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rule">
        <strong>Audit safety:</strong> audit records are displayed read-only. This screen does not edit, delete,
        reverse, or create financial records.
      </section>
    </main>
  );
}
