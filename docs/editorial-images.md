# Artist chapters

The five artist landscapes and fifteen sculpture-setting photographs are saved under `public/assets/`. The master JPEGs preserve the native dimensions returned by the built-in image-generation tool. They are not enlarged. Smaller WebP variants are under `public/assets/responsive/`; `public/media-manifest.json` lets the browser choose a suitable size without cropping a photograph.

The complete final prompt set and asset paths are recorded in [editorial-image-prompts.json](editorial-image-prompts.json). The approved apartment hero files remain unchanged.

`public/editorial.json` associates each landscape and its three setting images with a specific artist and sculpture. The artist name, sculpture ID and title, and original portrait and sculpture URLs guard that association. Replacing either original photo or renaming either subject stops the old editorial set from appearing; the current artist portrait and sculpture photos are shown instead. New sculptures remain visible as regular work tiles and open their own detail pages.

Update the matched editorial set when the real artist-and-sculpture photographs and interior photography are ready. Keep the artist/work IDs, record the current portrait/sculpture source URLs, and add each image to the media manifest. Content edits still use the collection editor; code deployments never reset the live database or uploaded media.

The chapter uses an abbreviated description only while the artist's original description matches `descriptionSource`. Changes to that description in the collection editor therefore appear on the homepage without requiring a code change.
