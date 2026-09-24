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

  // What the page is actually putting out: the jokes/facts split and how many
  // are reels, so the content mix is visible without opening the queue.
  const mix = { facts: 0, memes: 0, reels: 0 };
  for (const p of posts) {
    if (p.category === "FACTS") mix.facts++;
    else mix.memes++;
    if (p.mediaType === "reel") mix.reels++;
  }
  const lanes = Object.entries(settings.categories)
    .filter(([, c]) => c.enabled)
    .map(([lane]) => lane);

  return (
    <main className="wrap">
      <Nav />

      <PostingToggle initial={settings.postingEnabled} />

      <div className="statusgrid">
        <div className="status"><div className="k">Joke writer</div><div className="v">{status.jokewriter}</div></div>
        <div className="status"><div className="k">Photos</div><div className="v">{status.photos}</div></div>
        <div className="status"><div className="k">Storage</div><div className="v">{status.storage}</div></div>
        <div className="status"><div className="k">Posting</div><div className={`v ${dry ? "dry" : "live"}`}>{status.posting}</div></div>
      </div>

      <div className="statusgrid">
        <div className="status"><div className="k">In queue</div><div className="v">{counts.queued}</div></div>
        <div className="status"><div className="k">Posted</div><div className="v">{counts.posted}</div></div>
        <div className="status"><div className="k">Failed</div><div className="v">{counts.failed}</div></div>
        <div className="status"><div className="k">Posts / day</div><div className="v">{settings.postsPerDay}{settings.reel.enabled ? ` + ${settings.reel.perDay} reels` : ""}</div></div>
      </div>

      <div className="statusgrid">
        <div className="status"><div className="k">Memes</div><div className="v">{mix.memes}</div></div>
        <div className="status"><div className="k">Facts</div><div className="v">{mix.facts}</div></div>
        <div className="status"><div className="k">Reels</div><div className="v">{mix.reels}</div></div>
        <div className="status"><div className="k">Humor edge</div><div className="v">{settings.humorEdge === "pg13" ? "PG-13" : settings.humorEdge === "clean" ? "Clean" : "Sharp"}</div></div>
      </div>

      <div className="statusgrid">
        <div className="status" style={{ gridColumn: "1 / -1" }}>
          <div className="k">Active lanes</div>
          <div className="v" style={{ fontSize: "0.9rem", lineHeight: 1.7 }}>
            {lanes.length ? lanes.map((l) => (
              <span key={l} className={`pill ${l === "FACTS" ? "reel" : ""}`} style={{ marginRight: 8 }}>{l}</span>
            )) : "none — nothing will be generated"}
          </div>
        </div>
      </div>

      {dry ? (
        <div className="banner">
          <b>Dry-run mode.</b> Real memes are generated, but nothing is posted to
          Instagram or Facebook yet. Add your Meta keys to go live.
        </div>
      ) : null}

      <Actions />

      <div className="sectitle">Latest memes · <Link href="/queue" style={{ color: "var(--sig-to)" }}>see full queue</Link></div>
      {recent.length === 0 ? (
        <div className="empty">No memes yet. Click <b>Generate today&apos;s posts</b> to create the first batch.</div>
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
