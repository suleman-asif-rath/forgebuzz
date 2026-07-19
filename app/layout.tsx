import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Brand + editorial typefaces, self-hosted from brand/fonts.
const sans = localFont({
  src: "../brand/fonts/manrope.woff2",
  variable: "--font-sans",
  display: "swap",
});
const serif = localFont({
  src: "../brand/fonts/playfair.woff2",
  variable: "--font-serif",
  display: "swap",
});
const display = localFont({
  src: "../brand/fonts/anton.woff2",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ForgeBuzz — Control Room",
  description: "Automated branded-content pipeline for @forgebuzz",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
