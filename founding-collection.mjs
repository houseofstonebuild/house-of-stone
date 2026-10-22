// Merge the reviewed source roster into a private draft. Existing records and
// owner edits survive repeated imports; publication remains a separate action.
export function prepareFoundingCollection(current, blueprint) {
  const next = structuredClone(current);
  next.collections ||= [];
  for (const collection of blueprint.collections) if (!next.collections.some(item => item.id === collection.id)) next.collections.push(structuredClone(collection));
  for (const work of blueprint.works) if (!next.works.some(item => item.id === work.id)) next.works.push(structuredClone(work));
  for (const [key,value] of Object.entries(blueprint.assets)) next.assets[key] ||= value;
  for (const work of next.works) if (blueprint.legacyWorkIds.includes(work.id)) work.archived = true;
  next.site.featuredWorkId = next.collections[0].starWorkId;
  next.site.catalogueEdition = blueprint.version;
  return next;
}
