# Formicarium Art Direction + Asset Manifest

## DIRECTION

Formicarium should use a hybrid art approach:

- **Vector/SVG for entities and UI**
  - Best for ants, enemies, chamber icons, defenses, UI badges, and status overlays.
  - Keeps silhouettes crisp at Phaser zoom levels.
  - Supports runtime tinting for contamination, claimed-deep state, selection feedback, and alert states.
  - Keeps production swaps clean because the renderer already addresses texture keys instead of specific art files.

- **One raster backdrop for soil-strata atmosphere**
  - Use a single painted or pixel-painted background for the formicarium cross-section.
  - It should carry the mood: layered soil, roots, pebbles, glass glare, subtle depth gradient.
  - Keep it low-contrast behind gameplay paths so enemies and chambers remain readable.

- **Palette**
  - Surface layer: warm amber, ochre, earthy brown, muted orange.
  - Deep layer: pale bioluminescent cyan, cold violet shadows, desaturated fungal greens.
  - Formicarium frame: glass highlights, faint edge reflections, dark enclosure border.
  - Contamination: sick green, readable but not neon-noisy.
  - Claimed deep: amber reclamation tint against the cold deep palette.
  - Alerts/damage: red-orange pulses, used sparingly.

- **Legibility first**
  - Every unit should read from silhouette before detail.
  - Small enemies need high-contrast shapes.
  - Deep enemies should feel alien but still be distinguishable from deep chambers.
  - Defense silhouettes should be readable at a glance: wall/slow, sprayer/dot, guard/melee.

## ASSET MANIFEST

These are the exact texture keys currently created in `BootScene` and consumed by the renderers. Production art should replace the placeholder generation under the same keys.

| Texture key | Subject / use | Approx size | Required runtime tints / effects | Placeholder it replaces |
|---|---|---:|---|---|
| `node_queen` | Queen chamber node | `80x80` | Contamination green tint `0x8ee05f`; selection ring drawn separately | Yellow circle, radius `40` |
| `node_brood` | Brood chamber node | `70x70` | Contamination green tint `0x8ee05f`; selection ring drawn separately | Orange circle, radius `35` |
| `node_food` | Food storage node | `70x70` | Contamination green tint `0x8ee05f`; selection ring drawn separately | Green circle, radius `35` |
| `node_barracks` | Barracks node | `70x70` | Contamination green tint `0x8ee05f`; selection ring drawn separately | Red circle, radius `35` |
| `node_junction` | Surface junction node | `56x56` | Contamination green tint `0x8ee05f`; selection ring drawn separately | Gray circle, radius `28` |
| `node_deep` | Study, deep junction, and deep entrance nodes | `56x56` | Contamination green tint `0x8ee05f`; design should support deep cyan glow and claimed-deep amber tint | Purple circle, radius `28` |
| `node_entrance` | Surface entrance node | `40x40` | Contamination green tint if ever contaminated; smaller selection radius | White circle, radius `20` |
| `enemy_surface` | Default surface enemy; also used as repeated swarm sprite for swarm enemies | `20x20` | Death linger/fade uses alpha/scale; keep silhouette readable when duplicated in a swarm cluster | Red triangle |
| `enemy_deep` | Deep enemy | `20x20` | Death linger/fade uses alpha/scale; design should carry pale cyan/deep glow identity | Purple triangle |
| `enemy_boss` | Boss enemy | `40x40` | Death linger/fade uses alpha/scale; should support deep glow and high-priority readability | Red diamond |
| `defense_barricade` | Resin barricade / slow defense | `30x8` | No sprite tint currently; should remain readable on brown tunnel edges | Blue rectangle |
| `defense_acid` | Acid sprayer / DoT defense | `20x20` | No sprite tint currently; acid identity should remain distinct from contamination green | Green circle, radius `10` |
| `defense_guard` | Guard post / fallback defense texture | `20x20` | No sprite tint currently; should support future active/fire flash if needed | White square |

## Renderer Usage Notes

- `MapRenderer` maps node types to node texture keys:
  - `queen` -> `node_queen`
  - `brood` -> `node_brood`
  - `food` -> `node_food`
  - `barracks` -> `node_barracks`
  - `junction` -> `node_junction`
  - `entrance` -> `node_entrance`
  - `study`, `deep_junction`, `deep_entrance` -> `node_deep`
- `MapRenderer` tints contaminated node sprites with `0x8ee05f`.
- `MapRenderer` draws tunnel edges procedurally:
  - Normal edge color: `0x6b4a2b`
  - Contaminated edge color: `0x7bbf45`
  - Large edge width: `18`
  - Ant edge width: `10`
- `EnemyRenderer` chooses enemy texture by tags:
  - `boss` -> `enemy_boss`
  - `deep` -> `enemy_deep`
  - fallback -> `enemy_surface`
  - `swarm` enemies are rendered as three repeated sprites using the chosen texture.
- `DefenseRenderer` chooses defense texture by id/tags:
  - `resin_barricade` or `slow` tag -> `defense_barricade`
  - `acid_sprayer` or `dot` tag -> `defense_acid`
  - fallback -> `defense_guard`
- `EffectRenderer` currently uses Phaser primitive rectangles/circles for overlays, contamination bursts, breach fade, and queen-hit flash. It does not consume texture keys.

## Texture-Key Seam

Production art should swap in through `BootScene` under the identical keys listed above.

The renderers should not need to change. They already ask for semantic texture keys like `node_queen`, `enemy_deep`, and `defense_barricade`; the only thing that changes is how `BootScene` creates or loads those textures.

Recommended swap path:

1. Keep every existing key stable.
2. Replace placeholder graphics generation in `BootScene.createTextures()` with SVG/image loads or generated SVG textures using the same keys.
3. Preserve approximate footprint and anchor expectations so current positioning, selection rings, HP bars, and slot indicators remain aligned.
4. Keep runtime tint compatibility for node contamination, deep glow treatment, and future claimed-deep amber state.