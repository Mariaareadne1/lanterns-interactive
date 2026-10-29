# What LANTERNS took from its siblings

LANTERNS is self-contained (no imports across repos); these parts were copied and adapted from the family's MIT-licensed code.

| From | What | Where it lives here |
|---|---|---|
| SKY (forked from HIVE, MEADOW lineage) | Engine: renderer, frame loop, fixed-step override, dynamic resolution, context loss, PNG capture | `src/engine/Engine.ts` (sun shadows dropped; a wall-clock `now` and a camera pull-back added) |
| SKY / MEADOW | Post pass: PBR-Neutral tone curve, grain, dither | `src/engine/post.ts` (bloom added; the daylight grade removed) |
| MEADOW | `paintLight` two-tone painted light | `moonLight` + `lanternLight` in `src/scene/shaderChunks.ts` |
| MEADOW / SKY | Dry-brush paper edge, pigment stipple, flecks | `src/scene/terrain.ts` |
| POND | Painted water: wash, streaks, ripple rings, wet line | `src/scene/terrain.ts` (water), reflections rewritten for point lights |
| MEADOW / HIVE | Fleece/puff SDF surfaces and surface-nets mesher | `src/scene/wool.ts`, `src/scene/sdf.ts` (pines and round trees) |
| SKY | Pointer state machine, SVG ink overlay with shiver-away rejection, stroke smoothing | `src/interaction/*` |
| SKY / MEADOW | Immutable document, undo/redo with `amend`, external store, versioned validated persistence, import/export | `src/state/*` |
| MEADOW | `cleanName` → `cleanWish` | `src/state/document.ts` |
| SKY | Recorder that composites the ink | `src/capture/recorder.ts` |
| SKY | Selection box + contextual bar, toolbar, help/menu, toasts, UI tokens | `src/app/ui/*`, `src/app/styles.css` (dimmed for night) |
| SKY | Playwright with Metal ANGLE, QA scripts (shoot, draw, demo, perf, gallery) | `playwright.config.ts`, `scripts/*` |

Lessons carried over: Three's colour management already linearises `#hex`; keep things pickable mid-reveal; record with the ink; benchmark GPU-synced on a loaded machine; a pure function of time makes reloads, tests and recordings line up.
