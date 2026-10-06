"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Sign out failed");
      }

      window.location.href = "/login";
    } catch {
      setBusy(false);
      window.alert("Unable to sign out. Please try again.");
    }
  }

  return (
    <button
      className="button secondary sign-out-button"
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-busy={busy}
    >
      <span aria-hidden="true" className="sign-out-icon">↪</span>
      <span>{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
