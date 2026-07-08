"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Counts = {
  channel: number;
  iniu: number;
  library: number;
  reviews: number;
  firstPass: number;
};

const fmt = (n: number) => n.toLocaleString();

export default function Sidebar({
  counts,
  userEmail,
  isAdmin = false,
}: {
  counts: Counts;
  userEmail?: string | null;
  isAdmin?: boolean;
}) {
  const path = usePathname();
  const is = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const item = (href: string, label: string, badge?: number) => (
    <Link href={href} className={`nav-item${is(href) ? " active" : ""}`}>
      <span>{label}</span>
      {badge != null ? <span className="badge">{fmt(badge)}</span> : null}
    </Link>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <strong>Competitive Tracker</strong>
        <span>INIU powerbank market</span>
      </div>

      <nav className="nav-section">
        <div className="nav-section-label">Overview</div>
        {item("/", "Dashboard")}
      </nav>

      <nav className="nav-section">
        <div className="nav-section-label">Market</div>
        {item("/channel", "Channel", counts.channel)}
        {isAdmin ? item("/iniu", "INIU Products", counts.iniu) : null}
        {item("/roadmap", "Roadmap")}
      </nav>

      {isAdmin ? (
        <nav className="nav-section">
          <div className="nav-section-label">Data</div>
          {item("/library", "Library", counts.library)}
          {item("/reviews", "Reviews", counts.reviews)}
          {item("/first-pass", "First Pass", counts.firstPass)}
        </nav>
      ) : null}

      {userEmail ? (
        <div className="sidebar-user">
          <span className="sidebar-email" title={userEmail}>
            {userEmail}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="signout-btn">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
