// About page: what the model is, how it was trained, and how well it matches him.
import { imageUrl, loadJson } from './assets.js';

const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
let rendered = false;

export async function renderAbout(el) {
  if (rendered) return;
  rendered = true;
  let m = null;
  try { m = await loadJson('model/metrics.json'); } catch { /* metrics are optional */ }

  // Prefer the final test score; while training is still running, show the best validation score.
  const final = m?.finetuned_test ?? null;
  const tuned = final ?? m?.best_validation ?? null;
  const base = final ? m?.baseline_test : m?.baseline_validation;
  const split = final ? 'test' : 'validation';
  const phases = final?.by_phase ? Object.keys(final.by_phase) : [];

  const table = tuned && base ? `
    <table class="metric-table">
      <thead><tr><th>Held-out ${split} games</th><th class="num">Original Maia-2</th><th class="num">Trained on Peter</th></tr></thead>
      <tbody>
        <tr><td>Predicts his exact move</td><td class="num">${pct(base.top1)}</td><td class="num best">${pct(tuned.top1)}</td></tr>
        <tr><td>His move is in the top 3</td><td class="num">${pct(base.top3)}</td><td class="num best">${pct(tuned.top3)}</td></tr>
        ${phases.map((p) => `<tr><td>Exact move, ${p}</td><td class="num">${pct(m.baseline_test.by_phase[p])}</td><td class="num best">${pct(final.by_phase[p])}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="caption">Measured on ${tuned.positions.toLocaleString()} of his moves from games the model never trained on.</p>`
    : '<p class="note">Accuracy figures appear here once training has finished.</p>';

  el.innerHTML = `
    <div class="about-head">
      <img src="${imageUrl('img/peter/profile.webp')}" alt="Peter, the chess mascot">
      <div>
        <h1>How Peter Thiel plays</h1>
        <p class="lead">A neural network that learned to move like the Chess.com account PeterThiel.</p>
      </div>
    </div>
    <p>Peter does not search for the best move. He plays the move this player would most likely choose, including the mistakes a fast blitz player makes.</p>
    <div class="stats">
      <div class="stat"><b>43,797</b><span>games, 2016 to 2026</span></div>
      <div class="stat"><b>1.72M</b><span>of his moves learned from</span></div>
      <div class="stat"><b>${tuned ? pct(tuned.top1) : '–'}</b><span>exact-move match on unseen games</span></div>
      <div class="stat"><b>2202</b><span>his current blitz rating</span></div>
    </div>

    <h2>Accuracy</h2>
    ${table}

    <h2>The model</h2>
    <p>The starting point is <a href="https://github.com/CSSLab/maia2" target="_blank" rel="noreferrer">Maia-2</a> from the University of Toronto, trained on millions of human games to predict what a player of a given rating would play. It was then trained further on every move he made: his oldest 90% of games for learning, the next 5% to pick the best version, and his newest 5% kept aside for the scores above.</p>

    <h2>During a game</h2>
    <ul>
      <li><b>Openings come from his games.</b> For the first ten moves he picks a reply in proportion to how often he really played it.</li>
      <li><b>Then the model decides.</b> Human-like mode samples from its probabilities, so he varies and sometimes errs. Most likely move always plays its first choice.</li>
      <li><b>He thinks like a blitz player.</b> Faster in the opening, slower when unsure, quicker when his clock runs low.</li>
      <li><b>He resigns lost positions</b>, as he did in over half of his real games.</li>
      <li><b>Nothing leaves your computer.</b> The model runs in your browser.</li>
    </ul>

    <h2>Limits</h2>
    <p>No model plays exactly like a person, because people do not always choose the same move in the same position. Peter sees only the board and the ratings, and his games are almost all 3-minute blitz, so this is how he plays fast, not how he plays a long game.</p>
    <p class="note" style="margin-top:16px">Trained on public games from the Chess.com account PeterThiel. That the account belongs to the public figure is not verified. Not affiliated with, or endorsed by, Peter Thiel or Chess.com.</p>

    <h2>Credits</h2>
    <ul>
      <li>Maia-2 model and code by CSSLab, MIT License.</li>
      <li>Chess pieces: cburnett set by Colin M.L. Burnett, CC BY-SA 3.0, via lichess.org.</li>
      <li>chess.js (BSD-2-Clause), ONNX Runtime Web (MIT), Manrope (SIL Open Font License).</li>
    </ul>`;
}
