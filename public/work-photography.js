// Apply an owner-supplied photoshoot only while its original catalogue photo
// still matches. A later replacement in the collection editor takes precedence.
export function applyWorkPhotography(catalog, photography = {}) {
  for (const work of catalog.works) {
    const shoot = photography[work.id];
    if (!shoot || catalog.assets[work.image] !== shoot.source) continue;
    const key = work.id + '-photoshoot-front';
    catalog.assets[key] = shoot.front;
    work.image = key;
    work.views = {...work.views};
    for (const [side, source] of Object.entries(shoot.views || {})) {
      const viewKey = work.id + '-photoshoot-' + side;
      catalog.assets[viewKey] = source;
      work.views[side] = viewKey;
    }
  }
}
