import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cantagio — Control Room",
  description: "Automated branded-content pipeline for @cantagio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
