"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@susu.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Unable to sign in.");
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Unable to sign in. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="card" style={{ maxWidth: 520, margin: "70px auto" }}>
        <p className="eyebrow">SUSU MANAGEMENT</p>
        <h1>Sign in</h1>
        <p className="muted">
          Sign in to record payments and manage weekly payouts.
        </p>

        <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
