import Link from "next/link";
import { serviceStatus, isDryRun } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { getStore } from "@/lib/store";
import Nav from "./nav";
import Actions from "./actions";
import PostingToggle from "./posting-toggle";

export const dynamic = "force-dynamic";

export default async function Page() {
  const status = serviceStatus();
  const dry = isDryRun();
  const settings = await getSettings();
  const posts = await getStore().listRecent(60);

  const counts = { queued: 0, posted: 0, failed: 0 };
  for (const p of posts) counts[p.status]++;
  const recent = posts.slice(0, 6);

  return (
    <main className="wrap">
      <Nav />

      <PostingToggle initial={settings.postingEnabled} />

      <div className="statusgrid">
        <div className="status"><div className="k">Copywriter</div><div className="v">{status.copywriter}</div></div>
        <div className="status"><div className="k">Backgrounds</div><div className="v">{status.backgrounds}</div></div>
        <div className="status"><div className="k">Storage</div><div className="v">{status.storage}</div></div>
        <div className="status"><div className="k">Posting</div><div className={`v ${dry ? "dry" : "live"}`}>{status.posting}</div></div>
      </div>

      <div className="statusgrid">
        <div className="status"><div className="k">In queue</div><div className="v">{counts.queued}</div></div>
        <div className="status"><div className="k">Posted</div><div className="v">{counts.posted}</div></div>
        <div className="status"><div className="k">Failed</div><div className="v">{counts.failed}</div></div>
        <div className="status"><div className="k">Posts / day</div><div className="v">{settings.postsPerDay}</div></div>
      </div>

      {dry ? (
        <div className="banner">
          <b>Dry-run mode.</b> Real branded cards are generated, but nothing is posted to
          Instagram or Facebook yet. Add your Meta keys to go live.
        </div>
      ) : null}

      <Actions />

      <div className="sectitle">Latest cards · <Link href="/queue" style={{ color: "var(--sig-to)" }}>see full queue</Link></div>
      {recent.length === 0 ? (
        <div className="empty">No posts yet. Click <b>Generate today&apos;s posts</b> to create the first batch.</div>
      ) : (
        <div className="grid">
          {recent.map((p) => {
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
