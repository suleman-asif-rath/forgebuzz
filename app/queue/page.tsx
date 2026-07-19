import { getStore } from "@/lib/store";
import { getSettings } from "@/lib/settings";
import Nav from "../nav";
import QueueManager from "./queue-manager";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const posts = await getStore().listRecent(100);
  const settings = await getSettings();
  const queued = posts.filter((p) => p.status === "queued").length;

  return (
    <main className="wrap">
      <Nav />
      <div className="sectitle">
        Queue &amp; history · {queued} waiting
        {!settings.postingEnabled ? (
          <span style={{ color: "#ff6b7d", fontWeight: 700 }}> · posting is PAUSED</span>
        ) : null}
      </div>
      <QueueManager posts={posts} />
    </main>
  );
}
