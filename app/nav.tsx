"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/settings", label: "Settings" },
  { href: "/queue", label: "Queue" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <>
      <div className="topbar">
        <svg className="logo" viewBox="0 0 120 120" aria-label="ForgeBuzz">
          <defs>
            <linearGradient id="navg" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#3E86FF" />
              <stop offset="1" stopColor="#63C6F5" />
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="104" height="104" rx="27" fill="url(#navg)" />
          <path d="M60 22 C 62 48 72 58 98 60 C 72 62 62 72 60 98 C 58 72 48 62 22 60 C 48 58 58 48 60 22 Z" fill="#0B1020" />
        </svg>
        <div>
          <div className="brandname">ForgeBuzz Control Room</div>
          <div className="tag">Manage your brand: frequency, topics, safety, queue</div>
        </div>
      </div>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
