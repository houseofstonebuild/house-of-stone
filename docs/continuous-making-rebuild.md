# Continuous making experience

The owner requires a continuous, reversible scroll experience showing the complete making process and introducing House of Mabwe. Timed autoplay, a conventional gallery essay, and removing missing stages do not fulfil that brief. The earlier photographic opening is the baseline.

## Production approach

- Render the complete block, carving, sanding, heating and waxing sequence offline. The sculpture is presented alone: material changes, lighting and contact shadows share the scene. No animated hands, tools, flame or cloth are rendered.
- Derive the changing solid from the existing approved Coil geometry. Carving removal advances continuously across 208 source states; the former hammer-strike holds are removed. The source GLB is never written to. Preserve Douglas Musekiwa's credit and the catalogue route.
- Use 480 authored source positions per profile, with desktop and portrait cameras registered to the approved renderer. A final, higher-density capture preserves the existing approved finish exactly.
- Start manifests, compressed packs, decoding and large canvas allocation only when the corresponding chapter approaches. Fetch at most two packs concurrently and restrict lookahead to nearby packs. Release offscreen decoded images, retaining only a small return anchor. Decode only a bounded working window, keep compressed data for reversals, and smooth the playhead by elapsed time. Slow movement uses adjacent-frame blending; faster movement draws a sharp source frame without demanding two new decoded images for every paint.
- Give each stage its own scroll distance and endpoint rests. Drive captions from the displayed sequence rather than advancing the text while the image waits for media.
- Use content-hashed pack and background filenames and revalidate manifests, preventing old cached bytes from being interpreted using new offsets.
- Retain native source detail while cropping unchanged image margins from the working frames. Geometry-identical foreground passes and captured empty lighting plates preserve the rendered object and contact shadows on a continuous gallery background. Phone framing reserves space for navigation and captions; desktop action remains clear of the reading column. Full sources are 1440 × 810 on desktop and 960 × 2080 on phones.
- Keep the existing invitation disabled. Review at the standalone prototype only; preserve the homepage, catalogue, enquiries and production database.

## Visual sources

- Coil: existing `/models/coil-uploaded-v1.glb`, approved geometry, materials and final renderer. The output manifest records its SHA-256.
- Documentary: original multipart master, SHA-256 be15b5477458143d2e9f4258a6f124f7828de1ee1bbbd3a126a344ac57aaa98e. Listening uses 0.6–4.6 seconds (96 frames); workshop uses 5.7–10.533 seconds (116 frames), both at 24 fps, original colour and source-detail framing. It shows a representative workshop process rather than Coil's documented production.
- Photographic opening: restore the earlier `/assets/making-artist-and-block.webp` composition.

## Evidence required before publishing

Application checks and unit tests; source-model checksum; all frame-pack bounds and checksums; actual visible image progression during wheel input; large jumps and reversals; exact approved final image; all six stages; six responsive layouts; readable reduced motion; and visual inspection of captured frames and motion.

Passing these checks establishes the tested browser behaviour. It does not establish perfect performance on physical phones. Do not describe a requested frame counter or a small test canvas as evidence of full-viewport smoothness.

## Reference implementations

[GSAP's canvas sequence helper](https://gsap.com/docs/v3/HelperFunctions/helpers/imageSequenceScrub/) documents the basic sequence approach. [The OPTIKKA developers' case study](https://tympanus.net/codrops/2025/10/16/creating-smooth-scroll-synchronized-animation-for-optikka-from-html5-video-to-frame-sequences/) describes responsive sequences, background loading and canvas playback in a deployed project.

## November 17 refinements

The transport map zooms from 1× to 2.05× around the Guruve–Harare route, synchronised with the travelling marker and reversible with scroll. Both documentary chapters have longer scroll space. Their existing typography and composition, the photographic entrance, and the exact approved final Coil remain. Cold-load acceptance requires zero sequence requests and zero decodes on the opening screen; map zoom and both footage chapters must reverse correctly.
