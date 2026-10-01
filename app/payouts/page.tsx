import PayoutPanel from "./payout-panel";

export default function PayoutsPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Weekly payouts</h1>
          <p className="muted">
            Select an eligible week, then use a random draw or authorized manual selection.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href="/current-week">Current week</a>
          <a className="button secondary" href="/">Dashboard</a>
        </div>
      </header>

      <PayoutPanel />

      <section className="rule">
        <strong>Locked payout rule:</strong> one hand is paid per eligible week. A member with
        multiple hands receives only one hand in a single weekly payout. Every payout is recorded
        with its method and audit information.
      </section>
    </main>
  );
}
