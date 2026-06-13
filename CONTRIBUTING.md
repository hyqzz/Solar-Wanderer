# Contributing to Solar Wanderer

Thank you for your interest! Solar Wanderer is MIT-licensed and contributions of all kinds are welcome.

## Ways to Contribute

### 🐛 Bug Reports
Open a [GitHub Issue](https://github.com/hyqzz/Solar-Wanderer/issues) with:
- Browser and OS
- Steps to reproduce
- Screenshot or console output if relevant

### 💡 Feature Ideas
Open an issue to discuss before coding — especially for large changes. Check the roadmap in `CLAUDE.md` first.

### 🌍 Most Wanted Contributions

| Area | What's Needed |
|------|--------------|
| **Real terrain** | USGS LOLA (Moon) / MOLA (Mars) DEM tile streaming |
| **Eclipse shadows** | Sun–Moon–Earth shadow volumes |
| **Sound** | Ambient radio hiss, surface crunch, underwater |
| **Translations** | The UI is Chinese; English/other locale support |
| **Mobile** | Touch controls (pinch zoom, two-finger pan) |
| **Accuracy** | VSOP87 + ELP2000 for ±3000 year validity |
| **Bookmarks** | Save/restore position + time |

### 📖 Documentation / Corrections
Typo fixes, better explanations, and accuracy corrections are always welcome — just open a PR.

---

## Development Setup

```bash
git clone https://github.com/hyqzz/Solar-Wanderer.git
cd Solar-Wanderer
npm install
npm run dev      # dev server → http://localhost:5173
npm test         # 33 precision tests (no network needed)
npm run verify   # live cross-check against NASA JPL Horizons (needs internet)
```

The codebase is plain JavaScript (no TypeScript). The `src/astro/` layer is pure functions and runs in Node — that's where the tests live.

## Code Style

- Native ESM, no bundler magic in source files
- Functions over classes where practical
- Avoid adding comments that just restate the code — prefer clear naming
- Run `npm test` before opening a PR

## Pull Request Process

1. Fork → branch → change → `npm test` passes → open PR
2. Describe *what* and *why* (screenshots for visual changes)
3. PRs are reviewed and merged promptly — usually within 48 hours

---

Questions? Open an issue or start a Discussion. ⭐ Star the repo if Solar Wanderer made you feel small in a good way!
