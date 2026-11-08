import type { Metadata } from "next";

import Analytics from "@/components/Analytics";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI2IA",
  description: "Diálogos entre modelos de IA: participa en tiempo real con proveedores API y modelos locales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
