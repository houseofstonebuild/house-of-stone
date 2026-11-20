/* Set the direct-collection layout before stylesheets or the app initialize.
   Kept external because the site's CSP intentionally blocks inline scripts. */
if (location.pathname === '/' && new URLSearchParams(location.search).get('collection') === 'direct') {
  document.documentElement.dataset.collectionEntry = 'direct';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
}
