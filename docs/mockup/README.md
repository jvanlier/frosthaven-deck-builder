# Design mockup (not production code)

A static, clickable mockup of the chosen visual direction for the Frosthaven deck builder. It is a
**design reference only**: hard-coded sample data, a throwaway mini rules engine, no server, nothing is
saved. The real app is built per [`docs/spec.md`](../spec.md) and should not import anything from here.

## Run

```sh
cd docs/mockup && python3 -m http.server 8765
# open http://localhost:8765/
```

## What it shows

Sample build "Freeze control" (Snowdancer, start level 3, planned to level 6), with these screens:

- **Deck**: the deck at a level, a level switcher, a "Show guidance" toggle, this level's changes
  with motivations, and card detail on tap.
- **Level up**: this is the interactive part.
  - Cards are picked from "Newly unlocked", "Earlier, not yet picked" and "Swap more cards from the
    pool". Each picked or added card stays in place and shows its optional "Why…?" note on the card.
  - Tap a deck card to drop it, and write the "Why drop…?" note on the card.
  - Cards that are new this level can't be dropped from the deck. Undo them where they were picked.
  - A sticky bar shows the instruction ("Remove 1 card — 12 / 11"), Reset and Done.
  - 🔍 enlarges any card.
- **Overview**: a card × level matrix.
- **Notes**: all motivations.

All card displays use one size (220px wide, two per row on phones).

## Files

- `index.html`: the mockup (markup, styles, rendering).
- `data.js`: sample build and mini rules engine (mock only).
- `cards.js`, `cards/`: Snowdancer card metadata and images, plus `snowdancer-icon.png` (class icon).

## Attribution

Card artwork, text and class icon © Cephalofair Games, used for personal, non-commercial purposes.
Card data and images sourced via
[cmlenius/gloomhaven-card-browser](https://github.com/cmlenius/gloomhaven-card-browser).
