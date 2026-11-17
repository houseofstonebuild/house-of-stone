# Continuous making experience

The owner requires a continuous, reversible scroll experience showing the complete making process and introducing House of Mabwe. Timed autoplay, a conventional gallery essay, and removing missing stages do not fulfil that brief. The earlier photographic opening is the baseline.

## Production approach

- Render the complete block, carving, sanding, heating and waxing sequence offline. Tools, contact, material changes, lighting and shadows share the scene rather than being independent browser overlays.
- Derive the changing solid from the existing approved Coil geometry. Carving removal follows chisel strikes. The source GLB is never written to. Preserve Douglas Musekiwa's credit and the catalogue route.
- Use 480 authored source positions per profile, with desktop and portrait cameras registered to the approved renderer. A final, higher-density capture preserves the existing approved finish exactly.
- Fetch compressed media packs ahead of interaction. Decode only a bounded working window, keep compressed data for reversals, and smooth the playhead by elapsed time. Slow movement uses adjacent-frame blending; faster movement draws a sharp source frame without demanding two new decoded images for every paint.
- Give each stage its own scroll distance and endpoint rests. Drive captions from the displayed sequence rather than advancing the text while the image waits for media.
- Use content-hashed pack and background filenames and revalidate manifests, preventing old cached bytes from being interpreted using new offsets.
- Retain native source detail while cropping unchanged image margins from the working frames. A static plate restores the full composition. Full sources are 1440 × 810 on desktop and 960 × 2080 on phones.
- Keep the existing invitation disabled. Review at the standalone prototype only; preserve the homepage, catalogue, enquiries and production database.

## Visual sources

- Coil: existing `/models/coil-uploaded-v1.glb`, approved geometry, materials and final renderer. The output manifest records its SHA-256.
- Workshop: original supplied source passage, frames 135–192 of the v4 documentary source. It shows a representative workshop process rather than Coil's documented production.
- Photographic opening: restore the earlier `/assets/making-artist-and-block.webp` composition.
- Cross-pein hammer and propane torch: [Poly Haven](https://polyhaven.com/models/tools-equipment), CC0 scanned tool assets. The preparation manifest records the downloaded glTF checksums.
- Articulated hand geometry: [WebXR Input Profiles assets](https://github.com/immersive-web/webxr-input-profiles/tree/main/packages/assets/profiles/generic-hand), MIT. Source attribution belongs with the build provenance; no identity is attributed to the illustrative hands.

## Evidence required before publishing

Application checks and unit tests; source-model checksum; all frame-pack bounds and checksums; actual visible image progression during wheel input; large jumps and reversals; exact approved final image; all six stages; five responsive layouts; readable reduced motion; and visual inspection of captured frames and motion.

Passing these checks establishes the tested browser behaviour. It does not establish perfect performance on physical phones. Do not describe a requested frame counter or a small test canvas as evidence of full-viewport smoothness.

## Reference implementations

[GSAP's canvas sequence helper](https://gsap.com/docs/v3/HelperFunctions/helpers/imageSequenceScrub/) documents the basic sequence approach. [The OPTIKKA developers' case study](https://tympanus.net/codrops/2025/10/16/creating-smooth-scroll-synchronized-animation-for-optikka-from-html5-video-to-frame-sequences/) describes responsive sequences, background loading and canvas playback in a deployed project.
