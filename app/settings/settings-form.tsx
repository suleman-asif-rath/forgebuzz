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
          <label>Posting time style</label>
          <div className="chips">
            <span className={`chip ${s.postingMode === "fixed" ? "on" : ""}`} onClick={() => set("postingMode", "fixed")}>
              Fixed times
            </span>
            <span className={`chip ${s.postingMode === "variable" ? "on" : ""}`} onClick={() => set("postingMode", "variable")}>
              Variable (spread out)
            </span>
          </div>
          <span className="sub">
            {s.postingMode === "variable"
              ? "Posts (and reels) go out at randomized times spread across the hours below, different every day. Looks more natural — recommended."
              : "Posts go out exactly at the hours you pick below."}
          </span>
        </div>

        <div className="field">
          <label>{s.postingMode === "variable" ? "Active hours (window)" : "Posting times"}</label>
          <div className="chips">
            {HOURS.map((h) => (
              <span key={h} className={`chip ${s.slotHours.includes(h) ? "on" : ""}`} onClick={() => toggleHour(h)}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          <span className="sub">
            {s.postingMode === "variable"
              ? "In variable mode, posts are spread randomly between your earliest and latest selected hour."
              : `Exact times posts can go out. The first ${s.postsPerDay} are used each day.`}
          </span>
        </div>

        <div className="field">
          <label>Timezone</label>
          <input type="text" value={s.timezone} onChange={(e) => set("timezone", e.target.value)} />
          <span className="sub">IANA name, e.g. Asia/Karachi, Europe/London, America/New_York.</span>
        </div>

        <div className="togglerow" style={{ marginTop: 16 }}>
          <div>
            <div className="t-lbl">Reels</div>
            <div className="t-sub">Post short video reels (a stock clip with the joke burned on and music underneath) to Instagram &amp; Facebook, spread across the day. Reels reach far more people than image posts.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={s.reel.enabled}
              onChange={(e) => set("reel", { ...s.reel, enabled: e.target.checked })} />
            <span className="track" />
          </label>
        </div>

        {s.reel.enabled ? (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Reels per day</label>
            <div className="chips">
              {[1, 2, 3].map((n) => (
                <span key={n} className={`chip ${s.reel.perDay === n ? "on" : ""}`}
                  onClick={() => set("reel", { ...s.reel, perDay: n })}>
                  {n}
                </span>
              ))}
            </div>
            <span className="sub">Posted around 10:00, 15:00 and 20:00 PKT (the first {s.reel.perDay} slot{s.reel.perDay > 1 ? "s are" : " is"} used).</span>
          </div>
        ) : null}
      </div>

      {/* Humor lanes */}
      <div className="section">
        <h2>Humor lanes</h2>
        <div className="hint">Turn each kind of joke on or off, and set how often it shows up.</div>
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

      {/* Meme fuel */}
      <div className="section">
        <h2>Meme fuel</h2>
        <div className="hint">
          Where joke ideas come from. Every meme is written from scratch — nobody else&apos;s
          image is ever downloaded, re-hosted, or posted.
        </div>
        {([
          ["seeds", "Built-in seed bank", "200+ hand-written premises. Never fails, never rate-limits — leave this on."],
          ["reddit", "Reddit sparks", "Titles only, from subs where the title carries the idea. Keeps the page current."],
        ] as const).map(([key, label, sub]) => (
          <div className="togglerow" key={key}>
            <div><div className="t-lbl">{label}</div><div className="t-sub">{sub}</div></div>
            <label className="switch">
              <input type="checkbox" checked={s.fuel[key]}
                onChange={(e) => set("fuel", { ...s.fuel, [key]: e.target.checked })} />
              <span className="track" />
            </label>
          </div>
        ))}

        {s.fuel.reddit ? (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Reddit spark freshness (max age, hours)</label>
            <input type="number" min={6} max={168} value={s.maxAgeHours}
              onChange={(e) => set("maxAgeHours", Math.max(6, Math.min(168, Number(e.target.value) || 48)))} />
            <span className="sub">
              Ignore Reddit sparks older than this (48 is a good default). The seed bank is
              timeless and always exempt.
            </span>
          </div>
        ) : null}
      </div>

      {/* Humor edge */}
      <div className="section">
        <h2>Humor edge</h2>
        <div className="hint">
          How sharp the jokes are allowed to get. The hard lines — slurs, politics, religion,
          tragedy, sexual content, anything punching down — are blocked at every level and
          cannot be turned off.
        </div>
        <div className="field">
          <div className="chips">
            {([
              ["clean", "Clean"],
              ["pg13", "PG-13"],
              ["sharp", "Sharp"],
            ] as const).map(([val, label]) => (
              <span key={val} className={`chip ${s.humorEdge === val ? "on" : ""}`}
                onClick={() => set("humorEdge", val)}>
                {label}
              </span>
            ))}
          </div>
          <span className="sub">
            {s.humorEdge === "clean"
              ? "No swearing at all, warm and playful. Safe to show anyone."
              : s.humorEdge === "sharp"
              ? "Chronically-online and exaggerated, heavy internet slang, mild swearing only (damn, hell). Strong profanity is always blocked."
              : "Relatable and internet-native, mild swearing only (damn, hell). Grown-up life humour is fine. Recommended."}
          </span>
        </div>
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
          A built-in list already blocks hateful, political, tragic, and adult content. Add any extra words
          you never want to post about.
        </div>
        <div className="field">
          <label>Extra blocked words</label>
          <textarea value={blockedText} onChange={(e) => { setBlockedText(e.target.value); setSaved(false); }}
            placeholder="e.g. gambling, casino, lawsuit" />
          <span className="sub">Comma or line separated. Any premise or finished joke containing these is dropped.</span>
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
