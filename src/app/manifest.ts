import type { MetadataRoute } from "next";
import { getT } from "../i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, locale } = await getT();
  return {
    id: "/",
    name: t("app.title"),
    short_name: t("app.name"),
    lang: locale,
    description: t("manifest.description"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7ef",
    theme_color: "#6e304b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
