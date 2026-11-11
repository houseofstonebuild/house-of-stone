// Captions are reviewed against a specific bitmap, not merely an angle label.
// Replacing a view in the collection editor invalidates that review.
export function closerLookPhoto(work, assets, note) {
  if (!note?.heading || !note?.copy || !note.photoSource) return null;
  if (!['detail','detail2','right','left','back'].includes(note.photoView)) return null;
  const source = assets[work.views?.[note.photoView]];
  return source === note.photoSource && source !== assets[work.image] ? source : null;
}
