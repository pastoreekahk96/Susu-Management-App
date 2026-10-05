import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <section className="card" style={{ maxWidth: 560, margin: "80px auto" }}>
        <p className="eyebrow">SUSU MANAGEMENT</p>
        <h1>Page not found.</h1>
        <p>
          The page you requested does not exist. Return to the dashboard and
          continue managing the SUSU cycle.
        </p>
        <Link className="button primary" href="/">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
