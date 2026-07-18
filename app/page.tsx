import { serviceStatus, isDryRun } from "@/lib/config";
import { getStore } from "@/lib/store";
import Actions from "./actions";

export const dynamic = "force-dynamic";

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 120 120" aria-label="Cantagio">
      <defs>
        <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3E86FF" />
          <stop offset="1" stopColor="#63C6F5" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="104" height="104" rx="27" fill="url(#g)" />
      <path d="M84.4 30.9 A38 38 0 1 0 84.4 89.1" fill="none" stroke="#0B1020" strokeWidth="15" strokeLinecap="round" />
    </svg>
  );
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function Page() {
  const status = serviceStatus();
  const dry = isDryRun();
  const posts = await getStore().listRecent(30);

  return (
    <main className="wrap">
      <div className="topbar">
        <Logo />
        <div>
          <div className="brandname">Cantagio Control Room</div>
          <div className="tag">Automated branded posts for @cantagio</div>
        </div>
      </div>

      <div className="statusgrid">
        <div className="status"><div className="k">Copywriter</div><div className="v">{status.copywriter}</div></div>
        <div className="status"><div className="k">Backgrounds</div><div className="v">{status.backgrounds}</div></div>
        <div className="status"><div className="k">Storage</div><div className="v">{status.storage}</div></div>
        <div className="status"><div className="k">Posting</div><div className={`v ${dry ? "dry" : "live"}`}>{status.posting}</div></div>
      </div>

      {dry ? (
        <div className="banner">
          <b>Dry-run mode.</b> The full pipeline runs and real branded cards are generated,
          but nothing is posted to Instagram or Facebook yet. Add your Meta keys in{" "}
          <code>.env.local</code> to go live. Click <b>Generate today&apos;s posts</b> to see it work.
        </div>
      ) : (
        <div className="banner">
          <b>Live mode.</b> Due posts will be published to Instagram + Facebook when you click
          Publish or when the scheduled timers fire.
        </div>
      )}

      <Actions />

      <div className="sectitle">Recent posts</div>
      {posts.length === 0 ? (
        <div className="empty">No posts yet. Click <b>Generate today&apos;s posts</b> to create the first batch.</div>
      ) : (
        <div className="grid">
          {posts.map((p) => {
            const src = p.imagePath.startsWith("/") ? p.imagePath : p.imageUrl;
            return (
              <div className="post" key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={p.headline} />
                <div className="meta">
                  <div className="row">
                    <span className="pill">{p.category}</span>
                    <span className={`badge ${p.status}`}>{p.status}</span>
                  </div>
                  <h3>{p.headline}</h3>
                  <div className="sub">{fmtTime(p.scheduledFor)} · via {p.source}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
