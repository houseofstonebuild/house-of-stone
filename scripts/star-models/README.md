# Collection star model authoring

Five volumetric reconstructions correspond to original document pages 13, 28,
1, 20 and 5. Source photographs remain unchanged and are identified by SHA-256.
Contours are manually traced in 768 × 1024 image coordinates. Rounded implicit
volumes, sculpted recesses and connected component unions produce closed meshes.
Source colours are projected onto photographed surfaces; sampled stone textures
cover inferred surfaces. The shared viewer shader adds restrained reflections.

These are reference-based reconstructions, not scans. Single photographs cannot
establish true depth, unseen sides, reverse details or measured scale. Never
describe these as verified reproductions before checking additional views.

Build with Python 3.12+, numpy 2.3.5, scipy 1.17.0 and Pillow 12.3.0:

```sh
python scripts/star-models/build.py --step 7
python scripts/star-models/render.py
```

The renderer additionally requires Mesa/EGL and DejaVu Sans. It shares the
website surface shader and writes source/front/oblique/side/reverse comparisons
to `docs/model-review/`. Intermediate meshes and masks stay in ignored `review/`.
The audit records topology, actual source hashes, inferred surfaces and overlap
between the render and the manually traced silhouette. This overlap measures
front contour consistency only; it does not prove unseen geometry accuracy.

Assets use quantized GLB geometry and spatial triangle batches with 16-bit
indices; no geometry decimation is used. Five legacy models remain intact.
The homepage loads models progressively, uses one shared WebGL renderer and
retains image fallbacks, keyboard controls, mobile scroll and reduced motion.

Load the renovation into a private draft in `/admin/content`, then open the
private preview. All five new models are available there. Public pages keep
source photographs until the model verification field is confirmed individually
and that draft is published. Reimporting the blueprint preserves confirmations.
Rhythm's original page 13 stays Sold, including after model confirmation.

Validation: `npm run check`, `npm test`, and
`QA_ENGINE=chromium node qa/star-models.mjs` (also Firefox and WebKit in CI).
