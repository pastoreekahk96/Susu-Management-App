"use client";

import { useEffect } from "react";
import ThemeToggle from "./theme-toggle";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="shell system-state-page">
      <div className="system-state-theme"><ThemeToggle /></div>
      <section className="card system-state-card">
        <p className="eyebrow">Something went wrong</p>
        <h1>We could not load this page.</h1>
        <p>
          Your SUSU data has not been changed. Try the page again. If the
          problem continues, contact an administrator.
        </p>
        <button className="button primary" type="button" onClick={() => reset()}>
          Try again
        </button>
      </section>
    </main>
  );
}
