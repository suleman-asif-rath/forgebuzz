"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
const WEIGHT_LABEL = ["", "Rare", "Low", "Normal", "High", "Often"];

export default function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [hashtagsText, setHashtagsText] = useState(initial.voice.hashtagsCore.join(" "));
  const [blockedText, setBlockedText] = useState(initial.extraBlockedWords.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setS((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function toggleHour(h: number) {
    const has = s.slotHours.includes(h);
    const next = has ? s.slotHours.filter((x) => x !== h) : [...s.slotHours, h];
    set("slotHours", next.sort((a, b) => a - b));
  }

  function setCat(cat: string, patch: Partial<{ enabled: boolean; weight: number }>) {
    set("categories", { ...s.categories, [cat]: { ...s.categories[cat], ...patch } });
  }

  async function save() {
    setSaving(true);
    const payload: Settings = {
      ...s,
      voice: {
        cta: s.voice.cta,
        hashtagsCore: hashtagsText.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean)
          .map((h) => (h.startsWith("#") ? h : "#" + h)),
      },
      extraBlockedWords: blockedText.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean),
    };
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const next = (await res.json()) as Settings;
      setS(next);
      setHashtagsText(next.voice.hashtagsCore.join(" "));
      setBlockedText(next.extraBlockedWords.join(", "));
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Posting + frequency */}
      <div className="section">
        <h2>Posting &amp; frequency</h2>
        <div className="hint">How many posts a day and when they go out.</div>

        <div className="togglerow">
          <div>
            <div className="t-lbl">Posting enabled</div>
            <div className="t-sub">Master switch. Off pauses all publishing (queue keeps filling).</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={s.postingEnabled} onChange={(e) => set("postingEnabled", e.target.checked)} />
            <span className="track" />
          </label>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Posts per day</label>
          <input type="number" min={1} max={12} value={s.postsPerDay}
            onChange={(e) => set("postsPerDay", Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
          <span className="sub">Instagram allows up to 25/day. 5 to 7 is a healthy pace.</span>
        </div>

        <div className="field">
          <label>Posting times</label>
          <div className="chips">
            {HOURS.map((h) => (
              <span key={h} className={`chip ${s.slotHours.includes(h) ? "on" : ""}`} onClick={() => toggleHour(h)}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          <span className="sub">Times of day posts can go out. The first {s.postsPerDay} are used each day.</span>
        </div>

        <div className="field">
          <label>Timezone</label>
          <input type="text" value={s.timezone} onChange={(e) => set("timezone", e.target.value)} />
          <span className="sub">IANA name, e.g. Asia/Karachi, Europe/London, America/New_York.</span>
        </div>

        <div className="field">
          <label>News freshness (max age, hours)</label>
          <input type="number" min={3} max={72} value={s.maxAgeHours}
            onChange={(e) => set("maxAgeHours", Math.max(3, Math.min(72, Number(e.target.value) || 18)))} />
          <span className="sub">
            News-like posts must have happened within this many hours (12 to 18 recommended).
            Timeless "Did You Know" facts are exempt.
          </span>
        </div>

        <div className="togglerow" style={{ marginTop: 16 }}>
          <div>
            <div className="t-lbl">Daily reel</div>
            <div className="t-sub">Post one short video reel each evening (~19:00 PKT) to Instagram &amp; Facebook: a stock clip with calming music and your branded cover.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={s.reel.enabled}
              onChange={(e) => set("reel", { ...s.reel, enabled: e.target.checked })} />
            <span className="track" />
          </label>
        </div>
      </div>

      {/* Areas of interest */}
      <div className="section">
        <h2>Areas of interest</h2>
        <div className="hint">Turn topic areas on or off, and set how often each appears.</div>
        {Object.keys(s.categories).map((cat) => {
          const c = s.categories[cat];
          return (
            <div key={cat} className={`catrow ${c.enabled ? "" : "off"}`}>
              <label className="switch">
                <input type="checkbox" checked={c.enabled} onChange={(e) => setCat(cat, { enabled: e.target.checked })} />
                <span className="track" />
              </label>
              <span className="cname">{cat}</span>
              <div className="range">
                <input type="range" min={1} max={5} value={c.weight} disabled={!c.enabled}
                  onChange={(e) => setCat(cat, { weight: Number(e.target.value) })} />
                <span className="wlabel">{WEIGHT_LABEL[c.weight]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sources */}
      <div className="section">
        <h2>Trend sources</h2>
        <div className="hint">Where topics are pulled from.</div>
        {([
          ["googlenews", "Google News", "Fresh world, tech, entertainment & sports headlines"],
          ["reddit", "Reddit", "Popular posts from safe subreddits"],
          ["rss", "News RSS", "Space.com, ScienceDaily, The Verge"],
          ["hackernews", "Hacker News", "Trending tech stories"],
        ] as const).map(([key, label, sub]) => (
          <div className="togglerow" key={key}>
            <div><div className="t-lbl">{label}</div><div className="t-sub">{sub}</div></div>
            <label className="switch">
              <input type="checkbox" checked={s.sources[key]}
                onChange={(e) => set("sources", { ...s.sources, [key]: e.target.checked })} />
              <span className="track" />
            </label>
          </div>
        ))}
      </div>

      {/* Voice */}
      <div className="section">
        <h2>Voice</h2>
        <div className="hint">The caption call-to-action and the hashtags on every post.</div>
        <div className="field">
          <label>Call to action</label>
          <input type="text" value={s.voice.cta} onChange={(e) => set("voice", { ...s.voice, cta: e.target.value })} />
        </div>
        <div className="field">
          <label>Core hashtags</label>
          <input type="text" value={hashtagsText} onChange={(e) => { setHashtagsText(e.target.value); setSaved(false); }} />
          <span className="sub">Always included, plus topical ones. Space or comma separated.</span>
        </div>
      </div>

      {/* Safety */}
      <div className="section">
        <h2>Safety net</h2>
        <div className="hint">
          A built-in list already blocks political, tragic, and adult topics. Add any extra words
          you never want to post about.
        </div>
        <div className="field">
          <label>Extra blocked words</label>
          <textarea value={blockedText} onChange={(e) => { setBlockedText(e.target.value); setSaved(false); }}
            placeholder="e.g. gambling, casino, lawsuit" />
          <span className="sub">Comma or line separated. Any topic containing these is dropped.</span>
        </div>
      </div>

      <div className="savebar">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved ? <span className="saved">Saved. Takes effect on the next run.</span> : null}
      </div>
    </div>
  );
}
