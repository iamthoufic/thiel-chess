// Layout checks for the current viewport: run after resizing the window.
//   const l = await import('/tests/layout.mjs'); await l.check()
const $ = (s) => document.querySelector(s);
const rect = (el) => el.getBoundingClientRect();
const overlaps = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

export async function check() {
  const out = [];
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });
  const w = innerWidth;
  add('no horizontal scroll', document.documentElement.scrollWidth <= w + 1, `${document.documentElement.scrollWidth} > ${w}`);
  const brand = rect($('.brand'));
  const nav = rect($('.nav'));
  const actions = rect($('.top-actions'));
  add('header: actions inside the viewport', actions.right <= w + 0.5, actions.right);
  add('header: brand and actions do not overlap', !overlaps(brand, actions));
  if (getComputedStyle($('.nav')).position !== 'fixed') add('header: nav clear of brand and actions', !overlaps(nav, brand) && !overlaps(nav, actions));
  const board = rect($('#board'));
  add('board is square', Math.abs(board.width - board.height) < 1, `${board.width}x${board.height}`);
  add('board fits the width', board.left >= 0 && board.right <= w + 0.5, `${board.left}..${board.right}`);
  const panel = rect($('.panel'));
  add('panel within the width', panel.left >= -0.5 && panel.right <= w + 0.5, `${panel.left}..${panel.right}`);
  for (const bar of document.querySelectorAll('.player')) {
    const clock = rect(bar.querySelector('.clock'));
    const name = rect(bar.querySelector('.pname'));
    add('player bar: name clear of clock', name.right <= clock.left + 0.5, `${name.right} > ${clock.left}`);
  }
  // the game-over card fits on screen
  const modal = $('#resultModal');
  const wasHidden = modal.hidden;
  modal.hidden = false;
  const card = rect($('.modal'));
  add('result card fits the screen', card.width <= w - 16 && card.height <= innerHeight - 16, `${card.width}x${card.height}`);
  const btns = [...document.querySelectorAll('.modal-actions .btn')].map(rect);
  add('result buttons share left and right edges', btns.every((b) => Math.abs(b.left - btns[0].left) < 1 || Math.abs(b.right - btns[0].right) < 1));
  modal.hidden = wasHidden;
  return { width: w, height: innerHeight, passed: out.filter((r) => r.ok).length, total: out.length, failed: out.filter((r) => !r.ok) };
}
