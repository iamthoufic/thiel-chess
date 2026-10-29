// Maia-2 input encoding, ported from maia2.utils.board_to_tensor.
// When Black is to move the board is mirrored (ranks flipped, colours swapped)
// so the model always sees the side to move as White; moves are mirrored too.
const PIECES = 'pnbrqk'; // Maia-2 channel order: pawn, knight, bishop, rook, queen, king

const mirrorSquare = (sq) => sq[0] + (9 - Number(sq[1]));
export const mirrorUci = (uci) => mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4);

// Returns an 18x8x8 Float32Array laid out [channel][rank][file].
export function encodeFen(fen) {
  const [placement, turn, castling, ep] = fen.split(' ');
  const black = turn === 'b';
  const input = new Float32Array(18 * 64);
  placement.split('/').forEach((row, r) => {
    const rank = 7 - r;
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
      const white = ch === ch.toUpperCase();
      const channel = PIECES.indexOf(ch.toLowerCase()) + ((black ? !white : white) ? 0 : 6);
      input[channel * 64 + (black ? 7 - rank : rank) * 8 + file] = 1;
      file += 1;
    }
  });
  input.fill(1, 12 * 64, 13 * 64); // side to move is White after mirroring
  const rights = black ? ['k', 'q', 'K', 'Q'] : ['K', 'Q', 'k', 'q'];
  rights.forEach((flag, i) => {
    if (castling.includes(flag)) input.fill(1, (13 + i) * 64, (14 + i) * 64);
  });
  if (ep && ep !== '-') {
    const file = ep.charCodeAt(0) - 97;
    const rank = Number(ep[1]) - 1;
    input[17 * 64 + (black ? 7 - rank : rank) * 8 + file] = 1;
  }
  return input;
}

// Legal moves in UCI with their Maia-2 output index (mirrored for Black).
export function legalIndices(chess, moveIndex) {
  const black = chess.turn() === 'b';
  return chess.moves({ verbose: true }).map((m) => {
    const uci = m.from + m.to + (m.promotion ?? '');
    return { uci, san: m.san, index: moveIndex[black ? mirrorUci(uci) : uci] };
  });
}

// Maia-2 buckets ratings into 100-point bands from 1100 to 2000.
export function eloCategory(elo) {
  if (elo < 1100) return 0;
  if (elo >= 2000) return 10;
  return Math.floor((elo - 1100) / 100) + 1;
}
