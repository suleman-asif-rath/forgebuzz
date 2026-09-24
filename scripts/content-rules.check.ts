// Regression checks for the guardrails on a page that posts unattended.
//
// These are the rules that must never silently break: the safety filters, the
// humor-edge levels, and the premise picker honouring the dashboard settings.
// Everything here is pure logic — no network, no keys, no Gemini quota.
//
// Run with:  npm run check
//
// (The pivot from news to memes broke two of these in ways that were invisible
// until they ran: the seed bank tripping its own tragedy filter, and meme slang
// like "I'm dead" being treated as a real tragedy word.)

import { pickPremises } from "../lib/ideas";
import { SEEDS } from "../lib/premises";
import { isBlocked, isUnsafeOutput } from "../lib/blocklist";
import { fingerprint } from "../lib/util";
import type { LaneSetting, Premise } from "../lib/types";

const LANES = ["RELATABLE", "WORK", "SLEEP", "FOOD", "MONEY", "ANIMALS"];

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function lanes(weight = 3): Record<string, LaneSetting> {
  return Object.fromEntries(LANES.map((l) => [l, { enabled: true, weight }]));
}

const asPremise = (s: (typeof SEEDS)[number]): Premise => ({
  premise: s.premise,
  lane: s.lane,
  photo: s.photo,
  source: "seed bank",
  score: Math.random() * 100,
  evergreen: true,
});

const all = SEEDS.map(asPremise);

console.log(`\nSeed bank: ${SEEDS.length} premises\n`);

console.log("Seed bank integrity");
const selfBlocked = SEEDS.filter((s) => isBlocked(s.premise, [], false));
check(
  "no seed trips the hard blocklist",
  selfBlocked.length === 0,
  selfBlocked.slice(0, 3).map((s) => s.premise).join(" | "),
);
check(
  "every seed has a known lane and a photo hint",
  SEEDS.every((s) => LANES.includes(s.lane) && s.photo.length > 2),
);
const fps = SEEDS.map((s) => fingerprint(s.premise));
check(
  "no duplicate premises",
  new Set(fps).size === fps.length,
  `${new Set(fps).size}/${fps.length} unique`,
);

console.log("\nPremise picker honours the dashboard");
const laneOff = { ...lanes(), ANIMALS: { enabled: false, weight: 5 } };
check(
  "a disabled lane is never picked",
  pickPremises(all, { count: 40, usedFingerprints: new Set(), lanes: laneOff })
    .picks.every((p) => p.lane !== "ANIMALS"),
);
const used = new Set(all.slice(0, 100).map((p) => fingerprint(p.premise)));
check(
  "already-used premises are excluded",
  pickPremises(all, { count: 40, usedFingerprints: used, lanes: lanes() })
    .picks.every((p) => !used.has(fingerprint(p.premise))),
);
const distinct = pickPremises(all, { count: 30, usedFingerprints: new Set(), lanes: lanes() });
check(
  "picks within one run are distinct",
  new Set(distinct.picks.map((p) => fingerprint(p.premise))).size === distinct.picks.length,
);
const heavy = Object.fromEntries(
  LANES.map((l) => [l, { enabled: true, weight: l === "WORK" ? 5 : 1 }]),
) as Record<string, LaneSetting>;
let workPicks = 0;
const ROUNDS = 40;
const PER_ROUND = 6;
for (let i = 0; i < ROUNDS; i++) {
  workPicks += pickPremises(all, { count: PER_ROUND, usedFingerprints: new Set(), lanes: heavy })
    .picks.filter((p) => p.lane === "WORK").length;
}
const share = workPicks / (ROUNDS * PER_ROUND);
check(
  "a heavier weight raises that lane's share",
  share > 0.3,
  `WORK took ${(share * 100).toFixed(0)}% of picks`,
);

console.log("\nSafety nets");
check("news tragedy is blocked as a premise", isBlocked("shooting at a mall leaves many dead"));
check("politics is blocked as a premise", isBlocked("the president said something today"));
check(
  "curated seeds skip the tragic-news list",
  !isBlocked("the 4pm crash arriving on schedule", [], false),
);
check("a user's extra blocked word is honoured", isBlocked("a joke about gambling night", ["gambling"]));

console.log("\nHumor edge levels");
check("strong profanity is blocked even at 'sharp'", isUnsafeOutput("this is fucking great", "sharp"));
check("mild profanity is allowed at 'pg13'", !isUnsafeOutput("this damn alarm again", "pg13"));
check("mild profanity is blocked at 'clean'", isUnsafeOutput("this damn alarm again", "clean"));
check("meme slang \"I'm dead\" survives the output check", !isUnsafeOutput("i'm dead this is so me", "pg13"));
check("politics is blocked in output at every edge", isUnsafeOutput("the election was wild", "sharp"));
check("an ordinary joke passes", !isUnsafeOutput("my cat judges me from the shelf", "pg13"));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
