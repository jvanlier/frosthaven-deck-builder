// Shared sample data + tiny rules engine for all three mockups (not production code).
const C = Object.fromEntries(CARDS.map(c => [c.id, c]));
const HAND = 11;
const lvlNum = c => (c.level === "X" ? 1 : +c.level);
const sortIds = ids => [...ids].sort((a, b) =>
  lvlNum(C[a]) - lvlNum(C[b]) || (C[a].level === "X") - (C[b].level === "X") || C[a].init - C[b].init);

const BUILD = {
  name: "Freeze control",
  startLevel: 3,
  startPicks: [{ forLevel: 2, cardId: "tornado" }, { forLevel: 3, cardId: "cold-snap" }],
  startDeck: ["blizzard", "chilling-impact", "cold-therapy", "cross-winds", "lifting-gust", "snowball",
    "whiteout", "white-winds", "blinding-vortex", "tornado", "cold-snap"],
  levelUps: [
    { level: 4, pick: "biting-frost", added: ["biting-frost"], dropped: ["cross-winds"] },
    { level: 5, pick: "shifting-snow", added: ["shifting-snow", "frigid-growth"], dropped: ["lifting-gust", "blinding-vortex"] },
    { level: 6, pick: "birds-in-a-tempest", added: ["birds-in-a-tempest"], dropped: ["cold-therapy"] },
  ],
  motivations: {
    "3|enticing-breeze|exclude": "Pull is cute but we're not a positioning build.",
    "3|natures-breath|exclude": "Heal is fine, but the loss is too expensive this early.",
    "3|the-spirits-call|exclude": "",
    "4|biting-frost|add": "Brittle + freeze in one card. Exactly what this build wants.",
    "4|cross-winds|drop": "Weakest bottom in the deck once Biting Frost is in.",
    "5|shifting-snow|add": "Early initiative (17) lets me freeze before the monsters move.",
    "5|frigid-growth|add": "Brought back: Shifting Snow wants more ice infusions.",
    "5|lifting-gust|drop": "Movement is covered by Shifting Snow now.",
    "6|birds-in-a-tempest|add": "Skipped at 2, finally worth it with three ice generators.",
  },
  guidance: {
    "snowball": "Top: open with this on round 1 to infuse ice. Bottom move 3 is a good emergency escape.",
    "biting-frost": "Hold the top until an elite is adjacent to an ally. Combo with Whiteout.",
    "white-winds": "Initiative 11: your go-to for going first. Don't burn the loss before the boss room.",
    "cold-snap": "Loss. Save for a room with 3+ enemies grouped together.",
    "blizzard": "Bottom is a solid persistent; top only when ice is up.",
  },
  levelIssues: { 6: [] },
};
const LEVELS = [BUILD.startLevel, ...BUILD.levelUps.map(l => l.level)];
const MAX = LEVELS.at(-1);

function lu(L) { return BUILD.levelUps.find(l => l.level === L); }
function pool(L) {
  let p = CARDS.filter(c => c.level === "1" || c.level === "X").map(c => c.id).concat(BUILD.startPicks.map(p => p.cardId));
  for (const l of BUILD.levelUps) if (l.level <= L && l.pick) p.push(l.pick);
  return p;
}
function deck(L) {
  let d = [...BUILD.startDeck];
  for (const l of BUILD.levelUps) if (l.level <= L) d = d.filter(x => !l.dropped.includes(x)).concat(l.added);
  return sortIds(d);
}
function changes(L) {
  if (L === BUILD.startLevel) return { pick: null, added: [], dropped: [], start: true };
  return lu(L);
}
function motivation(L, id, kind) { return BUILD.motivations[`${L}|${id}|${kind}`]; }
function cellState(id, L) {
  const ch = changes(L);
  return {
    inDeck: deck(L).includes(id), inPool: pool(L).includes(id),
    picked: ch.pick === id, added: ch.added.includes(id), dropped: ch.dropped.includes(id),
    note: !!(motivation(L, id, "add") || motivation(L, id, "drop") || motivation(L, id, "exclude")),
  };
}
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

// ---- Level-up flow state (MAX -> MAX+1), interactive in every mockup ----
const LU = {
  from: MAX, to: MAX + 1, pick: null, extra: [], dropped: [],
  newly() { return sortIds(CARDS.filter(c => +c.level === this.to).map(c => c.id)); },
  earlier() { const p = pool(this.from); return sortIds(CARDS.filter(c => +c.level >= 2 && +c.level <= this.from && !p.includes(c.id)).map(c => c.id)); },
  base() { return deck(this.from); },
  working() { return sortIds([...this.base(), ...(this.pick ? [this.pick] : []), ...this.extra]); },
  count() { return this.working().length - this.dropped.length; },
  choose(id) { this.dropped = this.dropped.filter(x => x !== this.pick); this.pick = this.pick === id ? null : id; },
  toggleDrop(id) { this.dropped = this.dropped.includes(id) ? this.dropped.filter(x => x !== id) : [...this.dropped, id]; },
  swapIns() { return sortIds(pool(this.from).filter(id => !this.base().includes(id) && !this.extra.includes(id))); },
  addExtra(id) { this.extra.push(id); },
  reset() { this.pick = null; this.extra = []; this.dropped = []; },
  instruction() {
    const n = this.count();
    if (!this.pick) return { tone: "info", text: `Pick a new card for level ${this.to}` };
    if (n > HAND) return { tone: "warn", text: `Remove ${n - HAND} card${n - HAND > 1 ? "s" : ""} — ${n} / ${HAND}` };
    if (n < HAND) return { tone: "warn", text: `Add ${HAND - n} card — ${n} / ${HAND}` };
    return { tone: "ok", text: `Ready — ${n} / ${HAND}` };
  },
};
