# House of Mabwe introduction: audit and rebuild

Baseline: `e11535d05856f76756595808e1a7be95ff3caed1`.
Review: `rebuild/mabwe-introduction-2026-11-16`.
Scope: the unlinked `/prototypes/making-atelier.html` review. The public homepage invitation remains disabled.

## Findings

- Carving, finishing and the final sculpture occupied separate pinned sections. The model handoff changed its stage and interrupted the visual continuity.
- The visible model sequence started at frame 54 of the v7 source. It did not give the raw block a dedicated moment before carving.
- The illustrated sculpture had no visible hammer, chisel, sanding, heating or waxing tools. Actual workshop footage and the illustrated sculpture were disconnected.
- Documentary scrolling selected 384 × 216 tiles on phones and 480 × 270 tiles on desktop, then replaced them with high-resolution frames only after movement stopped. Visible softness during a gesture was an intentional quality reduction, not necessarily a network fault.
- Three independent source/image renderers and a later GLB presentation complicated transitions and decoding. A perpetual animation-frame observer ran even while idle.
- The stylesheet contained successive overrides from multiple versions. The phone captures had weak text hierarchy, repetitive dark panels and an abrupt change to the final gallery.
- Existing acceptance tests checked that some frame painted and requested indices moved. They did not require the displayed source to reach every tested target or verify physical tools, the exact final handoff, readable reduced-motion content or idle rendering.

Evidence: source code, source manifests, and the five-device visual captures from Actions run `43994458794`. Direct access to the deployed site was blocked by this workspace's network policy; those captures are automated browser evidence, not physical-device tests.

## Rebuild

- A single fixed sculpture stage now covers the block, carving, sanding, heating, wax/polish and the finished Coil. One source-image stream serves all six stages.
- A small physically lit tool renderer shows a forged steel chisel and wooden-handled hammer, abrasive strip, brass torch and polishing cloth. Carving contact is sampled from the displayed stone; finishing uses a matte silhouette of the same completed geometry so dark polish cannot move the cloth into the central opening. Poses and flame are determined by scroll, with no independent playback. Only the local tool rectangle is rendered. Changed poses are copied to a persistent 2D presentation canvas so WebKit cannot discard an idle transparent WebGL layer. Browser acceptance also checks actual nontransparent tool pixels, rather than a visibility flag alone.
- The final approved Coil renderer/still shares the process stage. It is initialized near the sequence while scrolling is idle. Reverse scrolling removes the exact final layer immediately and restores the source-derived carving frame.
- Documentary motion uses the 1600-pixel source frames throughout the gesture. There is no low-resolution motion mode.
- The image player decodes before drawing, keeps the last good pixels, bounds concurrency and decoded memory, and gives the latest target priority. Offscreen scenes release decoded neighbors. It does not repaint idle frames. Canvas resolution is capped at the available source detail, avoiding software upsampling without substituting lower-resolution media.
- A clean stylesheet establishes a photographic opening, a light geographic chapter, an artist chapter, a full workshop view and a continuous process. Portrait tablets use the phone composition. Stage navigation supports direct revisiting without autoplay or scroll trapping. The collection exit remains available throughout the story, with header contrast following the chapter behind it. Tool materials are prewarmed during the opening.
- Reduced motion provides all six stages as readable articles with still images. The same content remains readable if JavaScript is unavailable.
- The final reveal preserves Coil's approved geometry, materials and maker credit. Catalogue records, production data and the homepage are outside the change.

## Validation

The review workflow runs `npm run check`, `npm test` and the five-layout WebKit/Chromium browser suite. The browser suite requires exact target/displayed frame agreement, reverse documentary movement, four visible tool stages, the approved final presentation, stage-button re-entry, bounded decoding, no idle repainting, text within viewport/navigation boundaries, and readable reduced-motion content. It records screenshots for every chapter and process stage.

Full repository checks, all 119 unit/integration tests, and all five responsive browser layouts passed on review `44d295c77a25e238f1f8ef40d2b2c6d94c6cc924` (Actions run `43999198212`). That run also passed native wheel interaction, rapid forward/reverse scrolling and an actual-pixel tool visibility check. Tool-region rendering reduced the same 60-frame software-graphics stress run from 56.8 to 20.5 ms at the 95th percentile on the Android layout, and from 72.2 to 30.2 ms on desktop. These figures compare the rebuild before and after that optimization; they are not measurements of the old production site or physical phones. The final source-detail cap and tool prewarming are checked in the subsequent review run. Physical iPhone/Android GPU performance, low-bandwidth behavior and subjective tool realism require separate assessment; automated browser success does not establish those results.

## Craft sources

- Agrippa Tirigu, [Sculpting the stone](https://www.zimsculptures.com/sculpting-the-stone/): first-person description of choosing stone, hammer/chisel work, rasps, finer wet sanding and warming before wax.
- ZimSculpt, [Care and repair](https://zimsculpt.com/care-and-repair/): heating with a hand-held torch and using wax on the warm stone.

The copy describes a representative process, with artist-specific variation. It does not attribute another artist's statements or a documented quarry journey to Douglas Musekiwa or Coil.

## Second review: remove the gimmicks and correct the pacing

Owner feedback on the first published rebuild: the floating tools look gimmicky, some stages pass too quickly, and the experience does not feel smooth. Passing functional tests did not establish a convincing visual experience.

Changes in the second review:

- Remove all procedural tools, the game-like stage buttons, and client-side WebGL startup. Handwork appears in the existing workshop footage. Lead with the owner's photograph of Douglas Musekiwa and Coil.
- Replace six equal percentage slices with authored pixel/viewport distances. On a compact phone, carving has at least 2,200 px; sanding, warming, finishing and the finished work each have at least 1,100 px. Entry/exit holds protect the key poses.
- Keep sanding and warming honest: the source generator produces repeated matte stills there. Stop implying that props on top of those stills constitute process footage. Describe those stages over the completed matte form.
- Dissolve the registered matte sculpture gradually into a still baked from the original approved renderer. The same finish value holds across the wax/final boundary, avoiding a second reveal, a camera change, or a cold model load. Both approved camera captures retain the exact source GLB and material settings.
- Replace per-frame network/decode work with source-detail four-frame sheets, with two decoded sheets per active sequence. Phone workshop sheets use a native 600 × 900 crop of the 1600 × 900 source; no lower-resolution motion mode is selected. All original sources are retained.
- Calculate progress from the actual sticky element height, so mobile browser chrome changes cannot squeeze the same phase into a shorter span.

Validation includes authored minimum reading distances, endpoint holds, forward/reverse native-detail motion, continuous finishing across its boundary, no floating tool elements, idle rendering, actual wheel input, compact phone layouts, and reduced-motion reading.
