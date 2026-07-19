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
        <svg className="logo" viewBox="0 0 120 120" aria-label="Cantagio">
          <defs>
            <linearGradient id="navg" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#3E86FF" />
              <stop offset="1" stopColor="#63C6F5" />
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="104" height="104" rx="27" fill="url(#navg)" />
          <path d="M84.4 30.9 A38 38 0 1 0 84.4 89.1" fill="none" stroke="#0B1020" strokeWidth="15" strokeLinecap="round" />
        </svg>
        <div>
          <div className="brandname">Cantagio Control Room</div>
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
