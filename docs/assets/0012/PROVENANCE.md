# Journey artwork

Generated for plan 012 on 2026-10-02 using the built-in image generation tool.

- `generated-map-original.png`: original wide pixel-inspired fantasy landscape; preserved as generated evidence, not the missing supplied reference image.
- `/web/public/art/journey-terrain.webp`: edited terrain with the embedded hero removed, resized to 1440px and encoded WebP at quality 84.
- `/web/public/art/journey-hero.webp`: separately generated transparent silver-armored hero, trimmed and resized to 160px, WebP quality 90.

Terrain prompt: overhead/isometric castle, cave, mine, ancient ruins and vault linked by a winding path; teal, cyan, emerald and silver with restrained gold; no text or UI. Edit preserved the composition and removed only the embedded character.

Hero prompt: full-body silver armored adventurer, teal cape, sword and shield, facing three-quarter right; crisp pixel-inspired painterly artwork; transparent background.

Checkpoint states, labels, paths and segment controls are semantic code overlays. Fonts are existing Expo Google Fonts assets, with original licenses under `web/public/fonts`.

## Supplied reference (recovered 2026-10-04)

`reference-journey-map.png` is the original image the author pasted when requesting plan 0012. It was not attached to the working tree at the time and was later recovered from the author's local coding-agent session history (2026-10-01), from the same message that opened the request. **The file is kept locally and is deliberately not committed**: it appears to be third-party stock art, and this repository is public. It is ignored by `.gitignore`. The author's own wording in that message, alongside the image, was: "Can we improve on the animation map in the long quest board, something like the image i provided **but in this case is in the context of my theme**. You may scale it to be small if it appears too big and it affects the other in terms of space and position."

The image shows a bright cartoon sci-fi level-select map: a winding dotted route linking numbered planet/node checkpoints, each with a three-star rating strip, interspersed with padlocked locked nodes, over a stylized horizon. It is a **style-agnostic structural reference** — winding route, per-stage checkpoints, distinct completed/available/locked states — not a palette or art-style target; the user's own wording commits to keeping Eiyu's theme. The per-node star-rating strip has no counterpart in Eiyu's model (stages are done/not-done; XP lives in stats) and is treated as explicitly out of scope, not a missed feature.
