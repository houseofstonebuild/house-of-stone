// Captions are reviewed against a specific bitmap, not merely an angle label.
// Replacing a view in the collection editor invalidates that review.
export function closerLookPhoto(work, assets, note) {
  if (!note?.heading || !note?.copy || !note.photoSource) return null;
  if (!['front','detail','detail2','right','left','back'].includes(note.photoView)) return null;
  const source = assets[note.photoView === 'front' ? work.image : work.views?.[note.photoView]];
  // A primary photograph is useful here only when a reviewed crop reveals detail.
  const cropped = closerLookCrop(note);
  return source === note.photoSource && (source !== assets[work.image] || cropped) ? source : null;
}

export function closerLookCrop(note) {
  const c = note?.photoCrop;
  if (!c || ![c.x,c.y,c.width,c.height,c.aspectRatio].every(Number.isFinite)) return null;
  if (c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0 || c.aspectRatio <= 0) return null;
  if (c.x+c.width > 1.000001 || c.y+c.height > 1.000001) return null;
  if (c.width*c.height >= .9) return null;
  return c;
}
