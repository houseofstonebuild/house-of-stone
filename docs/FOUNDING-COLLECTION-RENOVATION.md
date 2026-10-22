# Founding Collection renovation

The application supports collection-led browsing while preserving the existing catalogue editor, inquiry inbox, analytics, artists, editorial pages and legacy catalogue. This branch does not deploy the renovation or modify the production database.

## Review and publish the content later

After the code is deployed, open `/admin/content` and choose **Load collection renovation into draft**. This authenticated, revision-checked action imports the 23 source records and five collections, preserves owner edits and uploaded media, and archives the five earlier sample works without deleting their IDs or history. Repeating it does not overwrite existing source records. It does not publish. Use **Preview draft** to inspect all five collections and working content. Publication remains the existing separate action. Restore published versions through the editor if needed; newer records are retained as archived.

`content/catalog.json` remains the original seed for compatibility with existing installations. It is not a production content update mechanism. `content/founding-collection.json` is the editable renovation blueprint. Do not replace the production SQLite database or volume.

## Locked roster

| Collection | Star | Supporting original pages |
| --- | --- | --- |
| Rhythm | 13 · Sold | 9, 25, 29, 21 |
| Elemental | 28 | 17, 31, 12 |
| Presence | 1 | 26, 2, 23, 27 |
| Kinship | 20 | 14, 7, 10, 24 |
| Wild Grace | 5 | 6, 18, 16 |

Original pages 3, 4, 8, 11, 15, 19, 22 and 30 are excluded. IDs such as `zsa-013` retain source identity independently of working titles and future page addresses. Collection order, ordered membership, star and availability are data, editable in the private editor. Validation rejects duplicate primary membership and a star outside its own first position. Page 13 cannot silently lose its confirmed Sold status. Availability of the other 22 works is unknown until confirmed; Available and Reserved require explicit confirmation.

## Working content and verification

Proposed titles, stone types, centimetre dimensions, years and the five existing temporary artist assignments are review copy. They are visible in the authenticated draft preview and editable internally, with per-field confirmation flags. They are not factual records. The public projection uses neutral catalogue labels (for example **Rhythm 01**) and photo-based descriptions until the relevant information is confirmed. Unconfirmed artist credits, stone, measurements, year and other specifications are omitted from public pages. Public artist profiles receive linked works across collections once attribution is confirmed; the private preview shows all proposed assignments now.

Each source record tracks private notes, original page, cropped edge, model status, and confirmation flags. The editor supports finish, signature, weight in kg, base/inclusion, location, delivery, shipping, installation, care, authenticity, provenance and additional photo keys. Only confirmed nonempty information appears publicly. Confirmed cm measurements and kg weights also display inches and pounds. No provenance, signature, ethical sourcing, artist-approved story, price, delivery promise or availability has been invented. Inquiry remains the acquisition path. A sold work has an **Inquire about related works** action and its backend rejects an inquiry for the sold piece unless it explicitly requests alternatives. The selected work ID remains attached to both normal and alternative inquiries.

## Remaining assets and content

- **All five matching star GLBs are missing:** original pages **13, 28, 1, 20 and 5**. The old GLBs depict different sculptures and are never assigned to these source records. Correct photographs are shown instead. The scroll-driven viewer, accessible modal controls, reduced motion, near-viewport loading and fallback behavior are retained. Matched model definitions must use the same record ID, title and photo source in `public/models.json`. No non-star model is required in this phase.
- Additional angles, reverse views and detail photographs are missing for all 23 works. A single photograph does not establish the hidden geometry needed for an accurate 3D model. Obtain all-around reference photography or a scan before creating faithful models.
- Original pages **21** (top) and **27** (bottom) are already cropped in the source. The site preserves them without further cropping or invented reconstruction. Replace them with uncropped originals when available.
- Original pages **2, 9, 16, 17, 24, 25 and 27** are **810 × 1080**. The other 16 are **1536 × 2048**. Masters are extracted unchanged. Responsive variants are smaller than the originals, without artificial enlargement. Higher-resolution originals are needed for large-screen close inspection of the seven smaller photographs.
- Official titles, actual artists, stone, dimensions, weight, year, finish details, signatures, bases, locations, availability of 22 works, artist-approved stories, delivery/shipping/install/care details and provenance/authenticity remain unverified.

## Source integrity and repeatability

All 23 photographs byte-match their corresponding page in the original 31-page **ZSA Sculptures** PDF and the supplied roster. `scripts/import-source-photographs.py` extracts them from a local copy of that original PDF, verifies each photograph's SHA-256 fingerprint, and builds smaller WebP derivatives. It refuses a mismatched source and never fabricates uncropped content. It requires PyMuPDF 1.26.6 and Pillow 12.3.0; these are build tools, not application runtime dependencies. The original source document is not published by the site.

## Verification

`npm run check` validates both the legacy seed and the renovation blueprint. `npm test` covers catalogue contracts, private/public projection, revision conflicts, repeatable draft imports, routes, sitemap, Sold enforcement, selected-work inquiries and existing storage/privacy/editor/backend behavior. `node qa/collections.mjs` exercises the actual editor, private draft, all 41 routes at six viewports (320–3840 px), filtering, image decode and framing, navigation, normal and sold-alternative inquiries, and session logging. The existing browser, theme and real WebGL tests remain in CI for Chromium, Firefox and WebKit.
