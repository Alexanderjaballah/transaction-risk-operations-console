import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transaction Review Console",
  description: "Synthetic fintech transaction review workflow prototype",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main className="page-container">{children}</main>
        <footer>
          Synthetic data only · Server-controlled demo identity · Not production
          authentication
        </footer>
      </body>
    </html>
  );
}
