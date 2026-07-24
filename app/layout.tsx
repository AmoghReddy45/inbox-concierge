import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const ui = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Applies the stored Snow/Carbon preference before first paint (no theme flash).
const themeScript = `try{var t=localStorage.getItem("tenex.theme.v1");if(t==="carbon")document.documentElement.dataset.theme="dark";else if(t==="snow")document.documentElement.dataset.theme="light";}catch(e){}`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3001";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Inbox Concierge — Trustworthy AI inbox triage";
  const description =
    "Gmail triage with evidence for every decision: your last 200 threads sorted into buckets by an LLM pipeline that abstains when it isn't sure.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "Inbox Concierge",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${ui.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
