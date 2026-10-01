"use client";

import { useState } from "react";

export default function AuthBar({ email, role }: { email: string; role: string }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="auth-bar">
      <span>{email} · {role}</span>
      <button type="button" className="button secondary" onClick={logout} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
