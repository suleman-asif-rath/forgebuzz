import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForgeBuzz — Control Room",
  description: "Automated branded-content pipeline for @forgebuzz",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
