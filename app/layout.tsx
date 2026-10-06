import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "./theme-provider";\nimport ThemeProvider from "./theme-provider";

export const metadata: Metadata = {
  title: "SUSU Management",
  description: "SUSU contribution, payment, and payout management for Liberia.",
  applicationName: "SUSU Management",
  appleWebApp: {
    capable: true,
    title: "SUSU Management",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#173b3f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
