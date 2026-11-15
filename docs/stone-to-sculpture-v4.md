# Scroll-driven process study V4 — visual-quality rebuilding

## Provenance, asset, scope

- Work: Coil, model `public/models/coil-uploaded-v1.glb`, retained unchanged and the only artwork shown at the end.
- The route from Guruve to Harare remains an illustration, not Coil's verified quarry or logistics history.
- This changes only `public/prototypes/stone-to-sculpture.*`, the dedicated unlinked preview and its tests.

## Transitions

- The country-to-Guruve camera zoom is continuous. During transport the SVG camera follows the stone marker instead of remaining on a fixed map window. A final prolonged push into Harare uses the same map and blends directly into the workshop block over a controlled overlap, so the stone appears anchored at the arrival point.
- The springstone mass is one irregular mesh with a weathered mineral surface. There are no stacked square fragments.
- A deterministic, per-pixel distance field is derived from the *original Coil GLB projected triangles*. During 28 chisel contacts, fragments of the raw mass outside the target contours are removed in discrete steps. The opening appears naturally as the target silhouette is uncovered. In the final carving interval the raw stone has given way to a rough representation of the actual Coil geometry.
- Chisel cap and hammer face use explicitly colocated local coordinates. The real world-space contact distance is checked at multiple closed-hit positions in browser QA.
- Scroll position is damped in requestAnimationFrame; interpolation and fades apply to map pan, Harare arrival and material reveal. Supports reduced-motion.
- Rasp, wet sanding, controlled heating and clear-wax buffing remain illustrative, with the approved material revealing after polishing.

## Acceptance gates

- `npm run check` and `npm test` in the canonical repository.
- `qa/making-v4.mjs` confirms all eleven stages at desktop and phone widths; checks no overflow, final GLB readiness, progressive material removal, travel marker and hammer/chisel contact across five strike samples. Captures frames to `test-results/browser/making-v4/`.
- Inspect staged renders before replacing `/making`. Keep the design study unlinked and excluded from search engines.
- Verify deployed GitHub commit and live preview separately; do not confuse a check pass with a Railway deployment.
