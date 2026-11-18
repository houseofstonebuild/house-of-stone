# Making experience — guardrails and current architecture

Canonical review URL: https://houseofmabwe.com/prototypes/making-atelier.html. Homepage invitation stays disabled. The owner approved the current photographic entrance, sculpture-only transformation and final Coil. Do not restore animated hands or tools, replace the hero, add autoplay, or change the approved model.

## Current targeted changes

Two process sections: #process (block/carving) and #finishing (sanding/heat/wax/finished work). A full-viewport unpinned .process-break separates them. Shorter stage distances reduce scroll effort. There is ONE #processCanvas and ONE form player: move the canvas between .process-art hosts only when the corresponding section enters view. Never create a second form decoder/cache. Stage starts returned by __mabweContinuous.stages() include the intervening page distance relative to #process; preserve this for jumps and resize restoration.

The routeStone SVG group is a truck with a rock in its bed. Translate it along mapRoute and counter-scale gently during map zoom. Do not replace it with a plain dot.

Canvas backing resolution uses devicePixelRatio up to 3, capped by actual source width/height. Keep native detail; do not resize frame bitmaps or introduce workers without measured evidence. Those approaches regressed playback previously. Existing full sources: desktop 1440×810, portrait 960×2080; original documentary frames 1600×900 with a 1000×900 mobile crop. Upscaling files does not create detail.

## Non-negotiable performance behaviours

No sequence downloads, frame decodes or large canvas allocation on the opening screen. Warm only approaching chapters. Fetch at most two packs concurrently, retain bounded decoded windows, release offscreen frames, and stop rendering when settled. Preserve the fractional-target deadlock fix. Use content-hashed packs and unchanged approved Coil captures. Do not rerender the 480-position sequence for layout changes.

## Verification and publication

Run npm run check and npm test. Run qa/continuous-making-acceptance.mjs through the existing continuous-making-review workflow: six layouts, 3× iPhone, map reversal, both films, one canvas/two pins, real chapter break, all stages, original model hash, exact finish, reverse scrolling, actual painted motion, bounded memory, idle decoding, reduced motion. Inspect screenshots for phone copy/stone clearance. No lowering performance thresholds to pass.

Production lives on main. Use a fresh main SHA and leased fast-forward after passing review. qa/check-making-atelier-live.mjs verifies deployed code and all three sets of media (form/artist/workshop). A successful Railway status is deployment, not a substitute for the live hash check. Preserve catalogue IDs, enquiries and the production SQLite database.
