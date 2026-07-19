"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PostRow } from "@/lib/types";

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function QueueManager({ posts }: { posts: PostRow[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function del(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/posts/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (posts.length === 0) {
    return <div className="empty">Queue is empty. Generate posts from the Overview tab.</div>;
  }

  return (
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
              <div className="sub">{fmt(p.scheduledFor)} · via {p.source}</div>
            </div>
            <button className="qbtn" disabled={deleting === p.id} onClick={() => del(p.id)}>
              {deleting === p.id ? "Removing…" : "Delete"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
