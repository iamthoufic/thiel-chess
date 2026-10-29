// Small national flags for the player bars, drawn as SVG on a 30×20 grid.
// Flag emoji are not used: Windows browsers show them as two plain letters.
// At 19 px wide the drawings keep each flag's colours and main shapes and
// simplify the fine detail (coats of arms, small stars).

const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const circle = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

// stripes of the given colours with optional relative weights
function stripes(dir, colors, weights = colors.map(() => 1)) {
  const total = weights.reduce((a, b) => a + b, 0);
  const span = dir === 'h' ? 20 : 30;
  let at = 0;
  return colors.map((c, i) => {
    const size = (weights[i] / total) * span;
    const part = dir === 'h' ? rect(0, at, 30, size + 0.05, c) : rect(at, 0, size + 0.05, 20, c);
    at += size;
    return part;
  }).join('');
}
const h = (colors, weights) => stripes('h', colors, weights);
const v = (colors, weights) => stripes('v', colors, weights);

// a Nordic cross: [x, width] of the upright and [y, height] of the bar
function nordic(bg, cross, inner = null) {
  let out = rect(0, 0, 30, 20, bg) + rect(8, 0, 5, 20, cross) + rect(0, 7.5, 30, 5, cross);
  if (inner) out += rect(9.25, 0, 2.5, 20, inner) + rect(0, 8.75, 30, 2.5, inner);
  return out;
}

function star(cx, cy, r, fill, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

// a crescent: a disc with a second, offset disc in the background colour over it
const crescent = (cx, cy, r, dx, dy, r2, fill, bg) => circle(cx, cy, r, fill) + circle(cx + dx, cy + dy, r2, bg);

const UNION = (w = 30, hgt = 20) => `<svg x="0" y="0" width="${w}" height="${hgt}" viewBox="0 0 30 20" preserveAspectRatio="none">`
  + rect(0, 0, 30, 20, '#012169')
  + '<path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/>'
  + '<path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" stroke-width="1.4"/>'
  + rect(12.5, 0, 5, 20, '#fff') + rect(0, 7.5, 30, 5, '#fff')
  + rect(13.5, 0, 3, 20, '#C8102E') + rect(0, 8.5, 30, 3, '#C8102E')
  + '</svg>';

const US_DOTS = [1.6, 3.8, 6, 8.2].flatMap((y, r) => (r % 2 ? [2.4, 4.8, 7.2, 9.6] : [1.2, 3.6, 6, 8.4, 10.8]).map((x) => circle(x, y, 0.45, '#fff'))).join('');

// [name, drawing]
export const FLAGS = {
  AR: ['Argentina', h(['#74ACDF', '#fff', '#74ACDF']) + circle(15, 10, 1.7, '#F6B40E')],
  AM: ['Armenia', h(['#D90012', '#0033A0', '#F2A800'])],
  AU: ['Australia', rect(0, 0, 30, 20, '#012169') + UNION(15, 10) + star(7.5, 15, 2.4, '#fff', 7) + star(22.5, 16.5, 1.1, '#fff', 7) + star(22.5, 4.5, 1.1, '#fff', 7) + star(19.5, 9, 1.1, '#fff', 7) + star(25.8, 8, 1.1, '#fff', 7)],
  AT: ['Austria', h(['#ED2939', '#fff', '#ED2939'])],
  AZ: ['Azerbaijan', h(['#00B5E2', '#EF3340', '#509E2F']) + crescent(14, 10, 2.6, 0.7, 0, 2.1, '#fff', '#EF3340') + star(17.1, 10, 1, '#fff', 8)],
  BD: ['Bangladesh', rect(0, 0, 30, 20, '#006A4E') + circle(13.5, 10, 6, '#F42A41')],
  BE: ['Belgium', v(['#000', '#FDDA24', '#EF3340'])],
  BR: ['Brazil', rect(0, 0, 30, 20, '#009C3B') + '<polygon points="15,2.2 27.8,10 15,17.8 2.2,10" fill="#FFDF00"/>' + circle(15, 10, 4.3, '#002776')],
  CA: ['Canada', v(['#D80621', '#fff', '#D80621'], [1, 2, 1]) + '<path fill="#D80621" d="M15 4.2l1 2 1.2-.6-.5 2.7 1.7-1.5.4 1.1 1.9-.4-.6 1.9.8.4-2.9 2.3.3 1-3-.5v2.4h-.6v-2.4l-3 .5.3-1-2.9-2.3.8-.4-.6-1.9 1.9.4.4-1.1 1.7 1.5-.5-2.7 1.2.6z"/>'],
  CL: ['Chile', h(['#fff', '#D52B1E']) + rect(0, 0, 10, 10, '#0039A6') + star(5, 5, 2.4, '#fff')],
  CN: ['China', rect(0, 0, 30, 20, '#EE1C25') + star(5, 5, 3, '#FFFF00') + star(10, 2, 1, '#FFFF00') + star(12, 4, 1, '#FFFF00') + star(12, 7, 1, '#FFFF00') + star(10, 9, 1, '#FFFF00')],
  CO: ['Colombia', h(['#FCD116', '#003893', '#CE1126'], [2, 1, 1])],
  CZ: ['Czechia', h(['#fff', '#D7141A']) + '<polygon points="0,0 15,10 0,20" fill="#11457E"/>'],
  DK: ['Denmark', nordic('#C8102E', '#fff')],
  EG: ['Egypt', h(['#CE1126', '#fff', '#000']) + circle(15, 10, 1.6, '#C09300')],
  EE: ['Estonia', h(['#0072CE', '#000', '#fff'])],
  FI: ['Finland', nordic('#fff', '#002F6C')],
  FR: ['France', v(['#0055A4', '#fff', '#EF4135'])],
  GE: ['Georgia', rect(0, 0, 30, 20, '#fff') + rect(13, 0, 4, 20, '#FF0000') + rect(0, 8, 30, 4, '#FF0000')],
  DE: ['Germany', h(['#000', '#DD0000', '#FFCE00'])],
  GR: ['Greece', h(Array.from({ length: 9 }, (_, i) => (i % 2 ? '#fff' : '#0D5EAF'))) + rect(0, 0, 11.1, 11.1, '#0D5EAF') + rect(4.44, 0, 2.22, 11.1, '#fff') + rect(0, 4.44, 11.1, 2.22, '#fff')],
  HU: ['Hungary', h(['#CD2A3E', '#fff', '#436F4D'])],
  IS: ['Iceland', nordic('#02529C', '#fff', '#DC1E35')],
  IN: ['India', h(['#FF9933', '#fff', '#138808']) + '<circle cx="15" cy="10" r="2.3" fill="none" stroke="#000080" stroke-width="0.6"/>' + circle(15, 10, 0.55, '#000080')],
  ID: ['Indonesia', h(['#CE1126', '#fff'])],
  IR: ['Iran', h(['#239F40', '#fff', '#DA0000']) + circle(15, 10, 1.4, '#DA0000')],
  IE: ['Ireland', v(['#169B62', '#fff', '#FF883E'])],
  IL: ['Israel', rect(0, 0, 30, 20, '#fff') + rect(0, 2, 30, 2.8, '#0038B8') + rect(0, 15.2, 30, 2.8, '#0038B8') + '<path d="M15 6.2 18.3 12H11.7ZM15 13.8 11.7 8H18.3Z" fill="none" stroke="#0038B8" stroke-width="0.8" stroke-linejoin="round"/>'],
  IT: ['Italy', v(['#009246', '#fff', '#CE2B37'])],
  JP: ['Japan', rect(0, 0, 30, 20, '#fff') + circle(15, 10, 6, '#BC002D')],
  KZ: ['Kazakhstan', rect(0, 0, 30, 20, '#00AFCA') + circle(15, 9, 3, '#FEC50C')],
  LV: ['Latvia', h(['#9E3039', '#fff', '#9E3039'], [2, 1, 2])],
  LT: ['Lithuania', h(['#FDB913', '#006A44', '#C1272D'])],
  MX: ['Mexico', v(['#006847', '#fff', '#CE1126']) + circle(15, 10, 1.9, '#8C5A2B')],
  NL: ['Netherlands', h(['#AE1C28', '#fff', '#21468B'])],
  NZ: ['New Zealand', rect(0, 0, 30, 20, '#012169') + UNION(15, 10) + star(22.5, 16, 1.3, '#C8102E') + star(22.5, 4.5, 1.1, '#C8102E') + star(19.5, 9.5, 1.1, '#C8102E') + star(25.5, 8.5, 1.1, '#C8102E')],
  NG: ['Nigeria', v(['#008751', '#fff', '#008751'])],
  NO: ['Norway', nordic('#BA0C2F', '#fff', '#00205B')],
  PK: ['Pakistan', rect(0, 0, 30, 20, '#01411C') + rect(0, 0, 7.5, 20, '#fff') + crescent(19, 10.5, 5, 1.4, -1.2, 4.3, '#fff', '#01411C') + star(21.6, 7.6, 1.6, '#fff')],
  PE: ['Peru', v(['#D91023', '#fff', '#D91023'])],
  PH: ['Philippines', h(['#0038A8', '#CE1126']) + '<polygon points="0,0 17.3,10 0,20" fill="#fff"/>' + circle(5.8, 10, 1.8, '#FCD116')],
  PL: ['Poland', h(['#fff', '#DC143C'])],
  PT: ['Portugal', v(['#006600', '#FF0000'], [2, 3]) + circle(12, 10, 3.6, '#FFCC00') + circle(12, 10, 2.2, '#fff') + rect(10.9, 8.6, 2.2, 2.8, '#FF0000')],
  RO: ['Romania', v(['#002B7F', '#FCD116', '#CE1126'])],
  RU: ['Russia', h(['#fff', '#0039A6', '#D52B1E'])],
  SG: ['Singapore', h(['#EF3340', '#fff']) + crescent(5.5, 5, 3, 1.2, 0, 2.7, '#fff', '#EF3340')],
  ZA: ['South Africa', h(['#E03C31', '#001489']) + '<path d="M0 0 12 10H30M0 20 12 10" fill="none" stroke="#fff" stroke-width="6.6"/><path d="M0 0 12 10H30M0 20 12 10" fill="none" stroke="#007749" stroke-width="4"/><polygon points="0,3 8.6,10 0,17" fill="#FFB81C"/><polygon points="0,4.8 6.4,10 0,15.2" fill="#000"/>'],
  KR: ['South Korea', rect(0, 0, 30, 20, '#fff') + circle(15, 10, 5, '#0047A0') + '<path d="M10 10a5 5 0 0 1 10 0Z" fill="#CD2E3A"/>' + circle(12.5, 10, 2.5, '#CD2E3A') + circle(17.5, 10, 2.5, '#0047A0') + '<path d="M4 3.2 6.6 5.6M3.2 4.2 5.8 6.6M24 14.4 26.6 16.8M23.2 15.4 25.8 17.8M23.4 5.6 26 3.2M24.2 6.6 26.8 4.2M3.4 15.6 6 13.2M4.2 16.6 6.8 14.2" stroke="#000" stroke-width="0.6"/>'],
  ES: ['Spain', h(['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1])],
  SE: ['Sweden', nordic('#006AA7', '#FECC02')],
  CH: ['Switzerland', rect(0, 0, 30, 20, '#DA291C') + rect(13.2, 4.5, 3.6, 11, '#fff') + rect(9.5, 8.2, 11, 3.6, '#fff')],
  TR: ['Türkiye', rect(0, 0, 30, 20, '#E30A17') + crescent(11, 10, 5, 1.3, 0, 4, '#fff', '#E30A17') + star(17, 10, 2.2, '#fff')],
  UA: ['Ukraine', h(['#0057B7', '#FFD700'])],
  AE: ['United Arab Emirates', h(['#00732F', '#fff', '#000']) + rect(0, 0, 7.5, 20, '#FF0000')],
  GB: ['United Kingdom', UNION()],
  US: ['United States', h(Array.from({ length: 13 }, (_, i) => (i % 2 ? '#fff' : '#B22234'))) + rect(0, 0, 12, 10.77, '#3C3B6E') + US_DOTS],
  UZ: ['Uzbekistan', h(['#0099B5', '#fff', '#1EB53A']) + rect(0, 6.4, 30, 0.6, '#CE1126') + rect(0, 13, 30, 0.6, '#CE1126')],
  VN: ['Vietnam', rect(0, 0, 30, 20, '#DA251D') + star(15, 10, 5, '#FFFF00')],
};

// A flag for the player bars, or '' for an unknown code.
export function flagSvg(code) {
  const flag = FLAGS[code];
  if (!flag) return '';
  return `<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" role="img" aria-label="${flag[0]}"><title>${flag[0]}</title>${flag[1]}</svg>`;
}

// [code, name] pairs sorted by name, for the country picker
export const COUNTRIES = Object.entries(FLAGS).map(([code, [name]]) => [code, name]).sort((a, b) => a[1].localeCompare(b[1]));
