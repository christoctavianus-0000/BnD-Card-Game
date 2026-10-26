# B'n'D — Bind & Divide (Bravely Default II)

A faithful 1:1 web recreation of **B'n'D (Bind and Divide)** from *Bravely Default II*, built with React 18, TypeScript, and Vite.

### 🎮 Play Live
**[https://christoctavianus-0000.github.io/BnD-Card-Game/](https://christoctavianus-0000.github.io/BnD-Card-Game/)**

---

## Features
- **Complete 105-Card Catalog (`001`–`105`):**
  - `58` Monster cards across all 8 tribes (*Humanoid*, *Beast*, *Insect*, *Aquatic*, *Plant*, *Demon*, *Undead*, *Spirit*) with authentic Normal, Strengthened, and Weakened `4×4` footprints (including Reverse-Weaken traits on *Asmodeus* and *Sleipnir*).
  - `24` Asterisk Job cards and `23` Character cards (`15` board-placed + `8` 0-square Global Permanent cards).
- **1:1 Tactical 5×5 Engine:**
  - Primary/Secondary placement, Neutralize-before-Flank resolution, 8-directional Othello flanking, 180° opponent card rotation, Fortify shields, 3-turn Poison countdowns, visible & hidden Counter medals, *Brave*/*Default* triggers, and *Late Bloomer*.
- **All Regional Match Rules:**
  - Combine up to 2 simultaneous match rules: *No Keepsies* (`0.80×`), *Wipeout* (`1.10×`), *First Past the Post* (`1.20×`), and *Wraparound* (`1.40×`).
- **21 Canonical Duelists (Ranks C–S):**
  - Rank progression (`C → B → A → S`), dedicated Going-First/Going-Second AI decks for Rank A/S opponents, Keepsies card loss & Point Shop re-acquisition, 5-slot Deck Builder, and a one-click **Sandbox Mode** toggle to unlock all 105 cards immediately.

## Local Development

```bash
npm install
npm run dev      # Start Vite dev server
npm test         # Run Vitest unit test suite
npm run build    # Type-check and build production bundle into dist/
```
