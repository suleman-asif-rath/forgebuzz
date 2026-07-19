"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PostingToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postingEnabled: next }),
      });
      router.refresh();
    } catch {
      setOn(!next); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="master">
      <div>
        <div className="lbl">Posting is <span className={`state ${on ? "on" : "off"}`}>{on ? "ON" : "PAUSED"}</span></div>
        <div className="desc">
          {on
            ? "Due posts publish automatically on schedule."
            : "Nothing is being posted. The queue keeps filling so you can resume any time."}
        </div>
      </div>
      <label className="switch" aria-label="Toggle posting">
        <input type="checkbox" checked={on} disabled={saving} onChange={toggle} />
        <span className="track" />
      </label>
    </div>
  );
}
