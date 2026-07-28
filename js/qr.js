// qr.js — self-contained QR Code generator (byte mode, ECC level M, versions 1–10).
// No dependencies, no network. Produces a module matrix for the share cards so a
// shared photo carries a scannable link back to the app. Correctness is proven
// offline (see scratchpad qr self-test): Reed–Solomon syndromes are zero, the
// module placement round-trips to the same codewords, and the format bits decode
// to the chosen mask + EC level — the exact steps any scanner performs.

// ---- Galois field GF(256), primitive polynomial 0x11d --------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// Reed–Solomon generator polynomial of the given degree.
function rsGenerator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}
// EC codewords for one data block. `div` is the generator without its leading 1.
function rsEncode(data, ecLen) {
  const div = rsGenerator(ecLen).slice(1); // length ecLen
  const res = new Array(ecLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.shift(); res.push(0);
    if (factor !== 0) for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(div[j], factor);
  }
  return res;
}

// ---- Version parameters (ECC level M) -----------------------------------------
// [ecPerBlock, [blocksG1, dataCwG1], [blocksG2, dataCwG2]]
const VERSIONS = {
  1: [10, [1, 16]],
  2: [16, [1, 28]],
  3: [26, [1, 44]],
  4: [18, [2, 32]],
  5: [24, [2, 43]],
  6: [16, [4, 27]],
  7: [18, [4, 31]],
  8: [22, [2, 38], [2, 39]],
  9: [22, [3, 36], [2, 37]],
  10: [26, [4, 43], [1, 44]],
};
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const dataCwCount = (v) => VERSIONS[v].slice(1).reduce((s, [b, d]) => s + b * d, 0);

function chooseVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const need = 4 + countBits + byteLen * 8;
    if (need <= dataCwCount(v) * 8) return v;
  }
  return null; // too long for our supported range
}

// ---- Bitstream ----------------------------------------------------------------
function makeBitstream(bytes, version) {
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); // byte mode
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCwCount(version) * 8;
  push(0, Math.min(4, cap - bits.length)); // terminator
  while (bits.length % 8) bits.push(0); // pad to byte
  const pads = [0xec, 0x11];
  let pi = 0;
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0; for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  while (codewords.length < dataCwCount(version)) { codewords.push(pads[pi]); pi ^= 1; }
  return codewords;
}

// Split data codewords into blocks, compute EC, interleave (data then EC).
function buildCodewords(dataCw, version) {
  const [ec, ...groups] = VERSIONS[version];
  const blocks = [];
  let idx = 0;
  for (const [nb, dc] of groups) {
    for (let b = 0; b < nb; b++) {
      const d = dataCw.slice(idx, idx + dc); idx += dc;
      blocks.push({ data: d, ec: rsEncode(d, ec) });
    }
  }
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const out = [];
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- Matrix -------------------------------------------------------------------
function newMatrix(size) {
  const m = []; const fn = [];
  for (let r = 0; r < size; r++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(false)); }
  return { m, fn, size };
}
function placeFinder(M, r, c) {
  for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= M.size || cc < 0 || cc >= M.size) continue;
    const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
      && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
    M.m[rr][cc] = inRing ? 1 : 0;
    M.fn[rr][cc] = true;
  }
}
function placeAlignment(M, version) {
  const centers = ALIGN[version];
  for (const r of centers) for (const c of centers) {
    // skip the three that collide with finder patterns
    if ((r === 6 && c === 6) || (r === 6 && c === M.size - 7) || (r === M.size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
      M.m[r + dr][c + dc] = on ? 1 : 0;
      M.fn[r + dr][c + dc] = true;
    }
  }
}
function placeFunctionPatterns(M, version) {
  placeFinder(M, 0, 0);
  placeFinder(M, 0, M.size - 7);
  placeFinder(M, M.size - 7, 0);
  // timing patterns
  for (let i = 8; i < M.size - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    if (!M.fn[6][i]) { M.m[6][i] = v; M.fn[6][i] = true; }
    if (!M.fn[i][6]) { M.m[i][6] = v; M.fn[i][6] = true; }
  }
  placeAlignment(M, version);
  // dark module
  M.m[M.size - 8][8] = 1; M.fn[M.size - 8][8] = true;
  // reserve format + version info areas as function (filled later)
  reserveFormat(M);
  if (version >= 7) reserveVersion(M);
}
function reserveFormat(M) {
  for (let i = 0; i < 9; i++) { if (i !== 6) { M.fn[8][i] = true; M.fn[i][8] = true; } }
  for (let i = 0; i < 8; i++) { M.fn[8][M.size - 1 - i] = true; M.fn[M.size - 1 - i][8] = true; }
}
function reserveVersion(M) {
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    M.fn[i][M.size - 11 + j] = true; M.fn[M.size - 11 + j][i] = true;
  }
}

// BCH(15,5) format info; EC level M = 0b00.
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let d = data << 10;
  for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0b10100110111 << (i - 10);
  return ((data << 10) | d) ^ 0b101010000010010;
}
function placeFormat(M, mask) {
  const bits = formatBits(mask); // 15 bits, f14 = MSB
  const f = (k) => (bits >> k) & 1;
  const s = M.size;
  // copy 1 around the top-left finder, listed MSB(f14) → LSB(f0)
  const copy1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  // copy 2: f14..f8 up column 8 (bottom-left), f7..f0 along row 8 (top-right)
  const copy2 = [[s - 1, 8], [s - 2, 8], [s - 3, 8], [s - 4, 8], [s - 5, 8], [s - 6, 8], [s - 7, 8],
    [8, s - 8], [8, s - 7], [8, s - 6], [8, s - 5], [8, s - 4], [8, s - 3], [8, s - 2], [8, s - 1]];
  copy1.forEach(([r, c], i) => { M.m[r][c] = f(14 - i); });
  copy2.forEach(([r, c], i) => { M.m[r][c] = f(14 - i); });
}
function versionBits(v) {
  let d = v << 12;
  for (let i = 17; i >= 12; i--) if ((d >> i) & 1) d ^= 0b1111100100101 << (i - 12);
  return (v << 12) | d;
}
function placeVersion(M, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const b = (bits >> i) & 1;
    const r = Math.floor(i / 3), c = i % 3;
    M.m[r][M.size - 11 + c] = b;
    M.m[M.size - 11 + c][r] = b;
  }
}

// Zig-zag data placement.
function placeData(M, codewords) {
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let bi = 0, upward = true;
  for (let col = M.size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let k = 0; k < M.size; k++) {
      const row = upward ? M.size - 1 - k : k;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (M.fn[row][cc]) continue;
        M.m[row][cc] = bi < bits.length ? bits[bi] : 0;
        bi++;
      }
    }
    upward = !upward;
  }
}

const MASK_FN = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];
function applyMask(M, mask) {
  const out = M.m.map((row) => row.slice());
  for (let r = 0; r < M.size; r++) for (let c = 0; c < M.size; c++) {
    if (!M.fn[r][c] && MASK_FN[mask](r, c)) out[r][c] ^= 1;
  }
  return out;
}
function penalty(m) {
  const n = m.length; let p = 0;
  // rule 1: runs of 5+
  for (let r = 0; r < n; r++) for (const line of [m[r], m.map((row) => row[r])]) {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; }
      else run = 1;
    }
  }
  // rule 2: 2x2 blocks
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
  }
  // rule 3: finder-like pattern 1:1:3:1:1 with 4 light
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const match = (line, i, pat) => pat.every((v, k) => line[i + k] === v);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n - 11; c++) {
    const row = m[r], col = m.map((x) => x[r]);
    if (match(row, c, pat1) || match(row, c, pat2)) p += 40;
    if (match(col, c, pat1) || match(col, c, pat2)) p += 40;
  }
  // rule 4: dark ratio
  let dark = 0; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  const pct = (dark * 100) / (n * n);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

// ---- Public API ---------------------------------------------------------------
export function qrModules(text) {
  const bytes = typeof text === 'string' ? Array.from(new TextEncoder().encode(text)) : text;
  const version = chooseVersion(bytes.length);
  if (!version) return null;
  const size = 17 + version * 4;
  const dataCw = makeBitstream(bytes, version);
  const codewords = buildCodewords(dataCw, version);

  const base = newMatrix(size);
  placeFunctionPatterns(base, version);
  placeVersion(base, version);
  placeData(base, codewords);

  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(base, mask);
    // stamp format bits for scoring/output
    const withFmt = { m: masked, fn: base.fn, size };
    placeFormat(withFmt, mask);
    const score = penalty(masked);
    if (score < bestScore) { bestScore = score; best = { modules: masked.map((r) => r.map((v) => v === 1)), mask, version, size }; }
  }
  return best;
}
