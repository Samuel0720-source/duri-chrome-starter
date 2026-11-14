import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Jua } from "next/font/google";
import { I18nProvider } from "../i18n/client";
import { getT } from "../i18n/server";
import "./globals.css";
import "./garden.css";

// Rounded Korean display face for headings and the big day count.
const jua = Jua({ weight: "400", subsets: ["latin"], preload: false, display: "swap", variable: "--font-jua" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("app.title"), description: t("app.description"), icons: { apple: "/icons/apple-touch.png" } };
}
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbe5e9",
};
export default async function Layout({ children }: { children: ReactNode }) {
  const { locale } = await getT();
  return (
    <html lang={locale} className={jua.variable}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
