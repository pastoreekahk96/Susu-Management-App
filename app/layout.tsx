import type { Metadata } from "next";
import "./globals.css";
import AuthBar from "./auth-bar";
import { getCurrentUser } from "../lib/auth";

export const metadata: Metadata = {
  title: "SUSU Management",
  description: "SUSU contribution, payment, and payout management for Liberia."
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        {user ? <AuthBar email={user.email} role={user.role} /> : null}
        {children}
      </body>
    </html>
  );
}
