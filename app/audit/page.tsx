import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("en-LR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function prettyJson(value: string | null) {
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
    redirect("/");
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
      actor: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Audit log</h1>
          <p className="muted">Administrative record of important changes made in the system.</p>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href="/reports">Reports</a>
          <a className="button secondary" href="/members">Members</a>
          <a className="button secondary" href="/">Dashboard</a>
        </div>
      </header>

      <section className="stats">
        <article><span>Records shown</span><strong>{logs.length}</strong></article>
        <article><span>View</span><strong>Read-only</strong></article>
        <article><span>Order</span><strong>Newest first</strong></article>
        <article><span>Access</span><strong>Admin only</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Recent activity</h2>
            <p className="muted">Showing the latest 100 audit records. Audit entries cannot be edited from this page.</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="muted">No audit records have been recorded yet.</p>
        ) : (
          <div className="audit-list">
            {logs.map((log) => {
              const before = prettyJson(log.beforeJson);
              const after = prettyJson(log.afterJson);

              return (
                <article className="audit-row" key={log.id}>
                  <div className="audit-main">
                    <div className="audit-title">
                      <strong>{log.action}</strong>
                      <span className="badge">{log.entityType}</span>
                    </div>
                    <span className="muted">
                      {formatDate(log.createdAt)} · Entity {log.entityId}
                    </span>
                  </div>

                  <div className="audit-actor">
                    <strong>{log.actor?.name ?? "System / unknown actor"}</strong>
                    <span>{log.actor?.email ?? "No actor account recorded"}</span>
                    {log.actor ? <span>{log.actor.role}</span> : null}
                  </div>

                  {(before || after) ? (
                    <details className="audit-details">
                      <summary>View change details</summary>
                      <div className="audit-detail-grid">
                        {before ? (
                          <div>
                            <strong>Before</strong>
                            <pre>{before}</pre>
                          </div>
                        ) : null}
                        {after ? (
                          <div>
                            <strong>After</strong>
                            <pre>{after}</pre>
                          </div>
                        ) : null}
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
        <strong>Audit rule:</strong> important financial and administrative mutations are recorded with the authenticated actor.
        This viewer is read-only and does not provide controls to alter or remove audit history.
      </section>
    </main>
  );
}
