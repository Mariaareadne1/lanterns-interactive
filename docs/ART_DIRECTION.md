# LANTERNS — art direction

LANTERNS is the sixth piece in the family after MEADOW (draw a sheep), POND, HIVE, SKY and TIDE — and the first one at night. Same hand, same single gesture: **you draw a lantern over a lake at dusk; it lights up, lifts off, and drifts up into the sky.** Everything is measured against MEADOW's "Illustrated aerial references" (`meadow/docs/REFERENCE_ANALYSIS.md`): a painted tile on warm paper.

## What carries over unchanged
- **Tile on paper.** A rounded rectangle of paint on `#f4efe4`, its edge thinning into dry-brush specks. The paper stays warm cream at night — the tile glows like a little painting on a desk.
- **Gouache texture.** Flat-ish parcels with soft gradients, long sideways dry-brush strokes, pigment stipple, the odd pale fleck. No photo textures, no gloss, **no black**.
- **Puff modelling.** Pines and round trees are MEADOW's fleece fields (clumped SDF surfaces with a dry-brush silhouette), stacked in tiers for the pines.
- **Interface.** Inter Tight + Fraunces, wordmark top left ("LANTERNS / *draw one, let it go*"), a pill toolbar at the bottom, a thin blue selection box with a world-unit label and a contextual bar under it. Panels are MEADOW's tokens dimmed for night: translucent indigo, cream text, one warm accent (the lantern colour) on the primary action. Handwriting (Caveat) is used only for wishes.

## Blue hour in gouache
Night is painted in **deep indigo and violet washes**, never black or grey. Albedos are night colours in their own right; the moon only turns form between a pale lavender lit side and a deeper indigo shade.

| Role | Colour |
|---|---|
| Paper | `#f4efe4` |
| Sky overhead | `#1e2150` → `#2a2d63` |
| Sky mid / afterglow at the horizon | `#4a4683` → `#7c6a94`, a dusky rose `#a7869a` just behind the hills |
| Hills | `#3a3c6c` → `#4e4a86` |
| Grass (three slates, laid in strokes) | `#29395a`, `#354a66`, `#45586a` |
| Pines / round trees | `#22364a` / `#2d4254` |
| Lake | `#1a2150` near → `#2a3068`, picking up `#5a4d7e` toward the far bank |
| Moonlit path and bank | `#6c6a88`, `#5b5878` |
| Jetty planks | `#574858`, `#4c3f50`, `#5f4f5c` (plum-browns that turn honey-gold in lantern light) |
| Cottages | walls `#6b6893`, roofs `#3b3258`, windows `#ffcf7a`-ish warm |
| Moon | `#f2ecd6` with a `#c9c4e8` halo |
| Lantern papers (seeded) | apricot `#ffb06e`, rose `#ff9c8c`, butter `#ffd47a`, soft white `#fff0d6` |

## The sky
The sky is painted straight onto the page behind the tile: a broad arch of wash whose lower edge tucks behind the hills and lifts at the sides so paper shows beside the tile. Afterglow low, violet, deep indigo overhead; the first stars twinkle very gently; a pale moon hangs to the right and lays a broken column on the lake. Lanterns rise off the top of the tile into this wash and end as tiny warm stars in it.

## Light comes from the lanterns
- `paintLight` becomes `moonLight` (cool, dim, two-tone) plus `lanternLight`: up to eight warm point lights from the brightest lanterns near the ground, plus the three cottage windows. Each paints a soft disc with a brushy edge — painted falloff, not inverse-square — and reveals the "day colour" under the night wash (the jetty goes honey-brown, the grass olive).
- Far lanterns only glow; they never light the scene.
- **The lake** carries a long, streaky, vertically smeared reflection of every lantern and window and of the moon, broken into dashes by slow ripples. Floating lanterns throw a warm pool round themselves.
- **Bloom** on the glow only: the threshold sits above paper white, so only lights bloom. MEADOW's grain on top.

## The lantern
- **Its silhouette is your drawing**: the loop is read row by row into an upright, symmetric profile (keeping tall, squat, heart-ish, lopsided), its bottom cut where it is still wide to leave the open ring, and turned into a paper shell like a lathe.
- **Paper, lit from within**: brighter where the fibres are thin, hottest just above the flame, deeper and more saturated toward the silhouette, eight thin bamboo ribs as dark lines, a ring round the shoulders, a bamboo hoop and cross-wires at the bottom with the flame on them. Gentle flicker.
- **The wish** is written in a loose hand (Caveat, each letter nudged off the line) in dark ink on the side facing out, faint and glowing slightly.
- On the lake it sits on a little eight-sided folded-paper boat.

## Small life
A handful of fireflies over the reeds; a faint ripple ring on the lake now and then; stars twinkling very gently; the middle cottage's window goes dark after a minute and a half.

## Rules learned from the siblings
- `new THREE.Color('#hex')` is already linear; don't convert again.
- Things mid-reveal stay pickable (a lantern can be selected while it is still being painted in).
- Canvas-only recording loses the SVG ink; the recorder composites the line in.
- Benchmark with back-to-back frames and a GPU sync, on a loaded machine.
