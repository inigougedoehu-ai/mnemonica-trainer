import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const themeBootScript = `(()=>{try{const key="mnemonica.theme.v1";const saved=localStorage.getItem(key);const preference=saved==="light"||saved==="dark"||saved==="system"?saved:"system";const theme=preference==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):preference;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{}})()`;

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
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
