"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Actions() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "generate" | "publish">(null);
  const [msg, setMsg] = useState<string>("");

  async function run(kind: "generate" | "publish") {
    setBusy(kind);
    setMsg("");
    try {
      const res = await fetch(`/api/${kind}`, { method: "POST" });
      const data = await res.json();
      if (kind === "generate") {
        setMsg(`Generated ${data.queued?.length ?? 0} cards (${data.mode}). ${data.skipped?.length ?? 0} skipped.`);
      } else {
        setMsg(`Published ${data.posted?.length ?? 0} of ${data.due ?? 0} due (${data.mode}). ${data.failed?.length ?? 0} failed.`);
      }
      router.refresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="actions">
      <button className="btn" disabled={busy !== null} onClick={() => run("generate")}>
        {busy === "generate" ? "Generating…" : "Generate today's posts"}
      </button>
      <button className="btn secondary" disabled={busy !== null} onClick={() => run("publish")}>
        {busy === "publish" ? "Publishing…" : "Publish due posts"}
      </button>
      {msg ? <span className="result">{msg}</span> : null}
    </div>
  );
}
