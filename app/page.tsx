const members = [
  ["Kumba Fayah", 4],
  ["Daniel Moore", 1],
  ["Abraham Tarplah", 1],
  ["Randall Blakepeh", 1],
  ["Deborah Tokpah", 2],
  ["Kumbah Ukaegbu", 10],
  ["Wisdom Tarplah", 2],
  ["Cecelia Ukaegbu", 3],
  ["Judith Idee", 2],
  ["Bendu Garseeda", 2],
  ["Maron Dahn", 4],
  ["Christina", 2],
  ["Fallah Fayiah", 4],
  ["P. Arthur", 5],
  ["Rachel Fayiah", 4]
] as const;

const totalHands = members.reduce((sum, [, hands]) => sum + hands, 0);
const dailyTotal = totalHands * 50;
const weeklyTotal = dailyTotal * 7;

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUSU MANAGEMENT</p>
          <h1>Community cycle dashboard</h1>
          <p className="muted">
            47-hand cycle · Monday–Sunday contributions · payout after Sunday
          </p>
        </div>
        <span className="status">Cycle active</span>
      </header>

      <section className="stats">
        <article><span>Members</span><strong>{members.length}</strong></article>
        <article><span>Total hands</span><strong>{totalHands}</strong></article>
        <article><span>Daily collection</span><strong>{dailyTotal.toLocaleString()} LD</strong></article>
        <article><span>Weekly payout</span><strong>{weeklyTotal.toLocaleString()} LD</strong></article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Cycle members</h2>
            <p className="muted">Each member appears once; each hand remains an independent payout spot.</p>
          </div>
          <span className="badge">47 payout spots</span>
        </div>

        <div className="member-grid">
          {members.map(([name, hands]) => (
            <div className="member" key={name}>
              <div>
                <strong>{name}</strong>
                <span>{hands} {hands === 1 ? "hand" : "hands"}</span>
              </div>
              <span className="amount">{(hands * 50).toLocaleString()} LD/day</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rule">
        <strong>Business rule locked:</strong> Week 1 runs September 14–20, 2026.
        Sunday is the seventh contribution day. The draw becomes eligible only after
        the week is complete, and exactly one pending hand can be paid for that week.
      </section>
    </main>
  );
}
