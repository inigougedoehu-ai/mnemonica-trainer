import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Mnemónica · Entrenador de stack",
  description: "Entrenamiento móvil para aprender y repasar Mnemónica.",
  applicationName: "Mnemónica",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mnemónica",
  },
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
    apple: `${basePath}/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071826",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
