import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUSU Management",
    short_name: "SUSU",
    description: "SUSU contribution, payment, and payout management for Liberia.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9f9",
    theme_color: "#173b3f",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]
  };
}
