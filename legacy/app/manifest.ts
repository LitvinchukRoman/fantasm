import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NaUKMA Ideas",
    short_name: "Ideas",
    description: "Платформа ідей спільноти НаУКМА",
    start_url: "/",
    display: "standalone",
    background_color: "#14131b",
    theme_color: "#f2b544",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    lang: "uk",
  };
}
