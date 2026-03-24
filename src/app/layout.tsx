import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/crm-ui";
import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Atlas Trainer CRM",
  description:
    "AI-assisted CRM for personal training, group coaching, packages, workout execution, and client follow-up.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppProviders>
          <AuthGate>
            <AppShell>{children}</AppShell>
          </AuthGate>
        </AppProviders>
      </body>
    </html>
  );
}
