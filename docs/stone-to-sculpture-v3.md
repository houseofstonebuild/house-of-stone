# Stone to Sculpture — process study V3

This is an unlinked, noindex preview, not the published Making page.

## Identity and guarantees

- Approved artwork: Coil, `zsa-006`, by Douglas Musekiwa.
- Canonical final geometry: `public/models/coil-uploaded-v1.glb`; the prototype **loads this asset unchanged**, cloning its presentation materials only inside the preview.
- Existing inquiry data, database and collection records are untouched.
- No new quarry or workshop location is being assigned to the artwork. The map is contextual and the Guruve-to-Harare connection is an illustrative route, not a documented shipment.
- Natural Earth simplified Zimbabwe polygon is used in an original cartographic treatment; place markers are approximate geographic centers, not quarry pins.

## Main sequence

0. Zimbabwe — location and country context.
1. Guruve region — a documented area where springstone is mined.
2. Illustrative region-to-Harare transfer with stone visible on truck.
3. Rough, single-mass springstone slab with dark interior and iron-oxidized brown rind.
4. Chalk guidelines extracted from the actual front-view mesh.
5. Percussive hammer-to-chisel contact, cut removal synchronized to impact, fragments and dust.
6. Rasping and wet sanding (illustrative tools).
7. Localized heating via blowtorch (not a furnace).
8. Clear-wax application and cloth buffing, progressive material reveal.
9. Coil's approved geometry and finish; the follow-on room photo is from the existing House of Mabwe site.

## Sources and editorial constraints

- SFO Museum, Stone Sculpture of Zimbabwe: https://www.sfomuseum.org/exhibitions/stone-sculpture-zimbabwe/gallery
- Guruve gallery, The Sculpture Process: https://www.guruve.com/african-art-culture/sculpture-process/
- Agrippa Tirigu, Sculpting the Stone: https://www.zimsculptures.com/sculpting-the-stone/
- Ukama Gallery stone reference: https://www.ukama.ca/stone
- Map boundary: Natural Earth simplified Zimbabwe country outline, mirrored at https://github.com/johan/world.geo.json/blob/master/countries/ZWE.geo.json (public-domain Natural Earth data).
- Harare coordinates: United Nations Group of Experts on Geographical Names. Guruve town: OSM-derived Mapcarta coordinates.

The sequence is a representation of common Zimbabwean sculptural practices. We do not know the specific quarry, haulage route, individual tools, timing or finishing recipe actually used for Coil. Do not label this a verified provenance or artist documentary.

## Implementation / review

- Page: `public/prototypes/stone-to-sculpture.html`.
- JS: `public/prototypes/stone-to-sculpture.js`.
- CSS: `public/prototypes/stone-to-sculpture.css`.
- Automated browser review: `qa/making-v3.mjs`, writes 10 frames at 1440 and 390 widths.
- `test/making-prototype.test.mjs` checks source/factual guardrails, stone stages, and no homepage links.
- Hammer animation geometry is arranged so that at the strike frame, hammer center and chisel cap coincide; the browser QA probes actual world-space contact error.
- Reduced-motion preferences skip animated tools; visitors may also click Skip to finished work.
- Not considered production-ready until captured stage frames have been visually reviewed (especially realistic rock surfaces, chisel strike and wax application), all checks pass, and actual Railway production is verified.
