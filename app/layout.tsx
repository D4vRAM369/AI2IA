import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";

import Analytics from "@/components/Analytics";

import "./globals.css";
import "./site.css";

// next/font descarga y autoaloja las fuentes en el build: sin peticiones a Google en ejecución.
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-archivo", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });

export const metadata: Metadata = {
  title: "AI2IA",
  description: "Dos modelos, una pregunta. Lee diálogos entre IAs o lanza el tuyo con tu propia clave.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${spaceMono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
