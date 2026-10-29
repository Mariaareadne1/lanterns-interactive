# LANTERNS — case study

## The brief

MEADOW let you draw a sheep, and the family kept that one gesture through POND, HIVE, SKY and TIDE. LANTERNS had to be the first night piece and stay as simple: **one thing to draw (a lantern), one thing it makes (a light that goes up).** No colour pickers, no fireworks, no day/night controls, no score. If a feature was tempting, the instruction was to make the one thing better instead.

The whole piece lives on three moments: the drawn loop turning into *your* lantern, its glow warming the world around it, and letting it go.

## Decisions

**Night in gouache, not darkness.** The hard part was colour. Every albedo is a night colour in its own right — slate blue-greens, violet hills, an indigo lake — and the moon only turns form between a pale lavender lit side and a deeper indigo shade (`moonLight`, adapted from MEADOW's two-tone `paintLight`). Nothing is black, and the cream paper stays cream around the tile, so it still reads as a small painting on a desk.

**The sky is painted on the page.** A dome or a vertical backdrop never framed correctly at every aspect ratio. The sky is drawn in screen space instead, behind everything: a broad arch of wash whose lower edge tucks behind the hills (registered to the tile's far edge each frame) and lifts toward the sides, with a dry-brush rim. Stars and the moon are painted into it, and the moon's world position is projected so its column on the lake lines up.

**Light comes from the lanterns.** `lanternLight` adds up to eight warm point lights — the brightest lanterns near the ground — plus the three cottage windows. Each paints a soft disc with a brushy, noise-broken edge, and reveals the "day colour" under the night wash, so the jetty's plum-brown boards go honey-gold. Far lanterns only glow. Every lantern, window and the moon are also written to a reflection list that the water samples analytically: where the rippled mirror direction points at a light, narrow across and long along the view, broken into dashes. That gives the long, wobbling streaks that fill the lake as the sky fills.

**Your silhouette, read row by row.** The loop is smoothed and scanned like a polygon: at each of 22 rows, the outer left and right crossings give a half-width. That makes the lantern upright and symmetric while keeping the hand's proportions. The bottom is cut at the lowest row below the widest that is still half as wide (the open ring a sky lantern has), and the top is closed over. The profile is turned like a lathe, with normals taken from its own slope so there's no seam. Height and width are converted to world size separately (the elevated camera foreshortens height), so the lantern stands on screen where and how it was drawn — a Playwright test checks the lantern's projected box against the stroke's.

**A pure flight.** A lantern's pose is a function of (where it was set down, when it was made, when it was let go, its seed, now). Rising is a distance that starts slowly and then runs steadily, `v·(t − τ(1 − e^(−t/τ)))`, saturated toward a seeded star over the hills; height leads and the breeze drift lags, so it goes up first and then back. Sway, tilt and turning ease in from stillness, so letting go never jumps. Floating lanterns sail an elliptical lane round the lake that a unit test proves stays clear of the jetty and the shore. Because nothing is integrated, reloads put every lantern back where it is now, tests sample flights directly, and the recorder can run at a fixed step.

**Letting go is part of the drawing.** Drawing a lantern is one undo step; its wish and its release are amended into that step. One ⌘Z takes the whole lantern away, rather than pulling a lantern back down out of the sky, which would be strange.

## What went wrong, and what it taught

- **The stars were off the page.** The first seeded star heights (5–9 world units) were chosen by feel. In the frame, they sat above the top edge of the screen, so the sky stayed empty while their reflections showed on the lake. Projecting a grid of heights against the real camera gave the band that lands inside the painted sky (about 2.9–5 units, just behind the hills).
- **White lanterns.** Glowing paper at HDR values bloomed and tone-mapped to white. Pushing the tint toward candle orange, keeping the silhouette deep and saturated, and letting only the hot spot above the flame go pale made them read as warm paper.
- **An invisible wish.** The wish texture was bound and sampled, but the ink mixed at 0.42× over HDR-bright paper and vanished after tone mapping. Painting the ink green proved it was there, small and low on the face. Darker ink, a heavier hand and a higher, narrower band fixed it.
- **A jump at "Let go".** The continuity test caught sway and yaw switching on at full strength the instant a lantern was released. They now ease in.
- **Lanterns sailing into the jetty.** The lane test caught the outer lane brushing the jetty's end; the lanes were narrowed.
- **Drawings bigger than the world.** A typical 150 px loop is about 2.6 world units — taller than three cottages. Lanterns are clamped (sky 0.45–1.7, lake 0.35–1.0 units), proportions kept; ordinary-sized drawings are not clamped and match the stroke on screen.

## Checks

- 33 unit tests: closed-loop detection (open, tiny, overshooting ends), symmetrising lopsided loops, keeping tall vs squat, the screen anchor, radius and size clamping, every built-in shape; reveal, light-up and flare; monotonic altitude and frame-by-frame continuity across release for several seeds; the star target reached and held; determinism; reduced motion; floating lanterns staying on the water, clear of the jetty, starting exactly where set down and sailing round; wish sanitising; persistence validation (bad shapes, out-of-order profiles, implausible times, duplicates, the 40 cap); undo/redo with amended release.
- 15 Playwright tests in real Chromium with WebGL (Metal ANGLE), against both the dev server and the production build: the night tile on paper; a drawn loop becomes a lantern whose on-screen box matches the stroke and which brightens the boards round its foot (pixel brightness before and after); a huge loop is clamped with its proportions kept; a typed wish is written, sanitised and capped, and the lantern waits while you type; letting go rises; left alone it lets itself go; a lake drop floats and stays on the water; open and tiny strokes rejected with one message; Read wish, Glow (neighbours brighten) and Remove; the keyboard; undo/redo/clear/reload; corrupt storage and a bad import; PNG download; forty lanterns with no errors; reduced motion (no flicker); mobile touch drawing and tapping.
- Performance (GPU-synced back-to-back frames, forty lanterns, on a dev machine at load 13–15 on 12 cores, so noisy): 2880×1800 median 11–17 ms; 1440×900 median 5.2 ms, p99 8.4 ms. Dynamic resolution steps down when frames run long.
- Demo: H.264, 1600×900, 18.4 s, 685 frames — about 37 fps, because the machine was heavily loaded while recording (ffprobe and a contact sheet were checked).

## What's incomplete

- Only Chromium is tested; Safari and Firefox are untested.
- The demo was recorded at ~37 fps on a heavily loaded machine; a re-record on an idle one should reach 60.
- A heart-shaped loop becomes a heart-*ish* lantern: the row-by-row reading keeps outer widths, so a heart's top notch is lost.
- Lanterns don't occlude one another's light, and the jetty casts no shadow on the water.
- The lanterns are drawn larger than life (up to ~3 m tall at the label's scale) for legibility.
- Not deployed; `npx vercel --prod` is ready once the owner confirms.
