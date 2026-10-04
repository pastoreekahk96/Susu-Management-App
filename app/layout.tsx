import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUSU Management",
  description: "SUSU contribution, payment, and payout management for Liberia."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
