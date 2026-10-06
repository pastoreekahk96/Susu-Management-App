import Link from "next/link";
import ThemeToggle from "./theme-toggle";

export default function NotFound() {
  return (
    <main className="shell system-state-page">
      <div className="system-state-theme"><ThemeToggle /></div>
      <section className="card system-state-card">
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
