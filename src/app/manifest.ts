import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas Trainer CRM",
    short_name: "Atlas CRM",
    description:
      "AI-assisted CRM for personal training, group coaching, packages, workout execution, and client follow-up.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5ecdd",
    theme_color: "#1b2721",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
