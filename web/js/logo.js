// The Thiel Chess mark: a ring-headed pawn with a chevron collar on a rounded
// tile in the board theme's colour, with a darker lip underneath like the
// site's primary buttons. One drawing serves the header and the favicon.
//
// The pawn is a single even-odd path: ring head, chevron collar, a tall narrow
// stem that flares at the foot, a shouldered base and a plinth, each separated
// by a thin gap. At 16 px the gaps close up and the silhouette still reads.
const PAWN = [
  // traced from the reference drawing (1254 px, divided by 20)
  'M21.8 14.65a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0-19 0Z',             // head, outer
  'M25.8 14.65a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0Z',              // head, hole
  'M22.85 22 31.3 26.75 39.9 22l1.95 3.5-10.55 5.6-10.5-5.6Z',        // collar
  'M26.25 30 31.3 32.6 36.4 30c0 3.5-.1 5 .1 7 .5 5 3 8.6 6.9 10.4v.3H19.25v-.3c3.85-1.8 6.35-5.4 6.85-10.4.2-2 .15-3.5.15-7Z', // stem
  'M19 49.1h24.75v.8c0 .5.55.8 1.45 1 1.2.3 2.05 1.1 2.05 2.1v.5H15.35V53c0-1 .85-1.8 2.05-2.1.9-.2 1.6-.5 1.6-1Z', // base
  'M15.35 54.75h31.9v1.15c0 1.2-.95 2.2-2.15 2.2H17.5c-1.2 0-2.15-1-2.15-2.2Z', // plinth
].join('');

// colours: { tile, lip, pawn } for a standalone file; omitted, the parts take
// classes so the page's CSS (and so the board theme) colours them.
export function logoSvg(colors = null) {
  const fill = (part, value) => (colors ? `fill="${value}"` : `class="logo-${part}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">`
    + `<rect width="64" height="64" rx="15" ${fill('lip', colors?.lip)}/>`
    + `<rect width="64" height="60.5" rx="15" ${fill('tile', colors?.tile)}/>`
    + `<g transform="translate(32 30.25) scale(0.9) translate(-31.3 -31.6)"><path fill-rule="evenodd" d="${PAWN}" ${fill('pawn', colors?.pawn ?? '#fff')}/></g>`
    + '</svg>';
}

// Point the tab icon at the mark in the current theme's colours.
export function updateFavicon() {
  const css = getComputedStyle(document.documentElement);
  const svg = logoSvg({ tile: css.getPropertyValue('--go').trim(), lip: css.getPropertyValue('--go-press').trim(), pawn: '#fff' });
  const link = document.getElementById('favicon');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
