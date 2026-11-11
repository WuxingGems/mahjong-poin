// Ubin mahjong. 34 jenis ubin main (indeks 0..33) + 8 bunga/musim (nomor 1..8).
// 0-8 Karakter (萬) 1-9, 9-17 Bulat (筒) 1-9, 18-26 Bambu (條) 1-9,
// 27-30 angin Timur/Selatan/Barat/Utara, 31 Putih, 32 Hijau, 33 Merah.
// Bunga 1-4 (梅蘭菊竹) milik kursi Timur..Utara, musim 5-8 (春夏秋冬) juga Timur..Utara.

export const TILE_TYPES = 34;

export const isHonor = (i) => i >= 27;
export const isWind = (i) => i >= 27 && i <= 30;
export const isDragon = (i) => i >= 31;
export const isTerminal = (i) => i < 27 && (i % 9 === 0 || i % 9 === 8);
export const isTermOrHonor = (i) => isHonor(i) || isTerminal(i);
export const suitOf = (i) => (i < 27 ? Math.floor(i / 9) : 3);
export const numOf = (i) => (i < 27 ? (i % 9) + 1 : i - 26);
/** angin kursi/ronde (1=Timur..4=Utara) -> indeks ubin angin */
export const windTile = (w) => 26 + w;

export const WIND_NAME = ['', 'Timur', 'Selatan', 'Barat', 'Utara'];
export const WIND_CH = ['', '東', '南', '西', '北'];
const SUIT_NAME = ['Karakter', 'Bulat', 'Bambu'];
const HONOR_NAME = ['Timur', 'Selatan', 'Barat', 'Utara', 'Putih', 'Hijau', 'Merah'];
const HONOR_CH = ['東', '南', '西', '北', '白', '發', '中'];
const FLOWER_CH = ['梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬'];
const NUM_CH = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function tileName(i) {
  return i < 27 ? `${numOf(i)} ${SUIT_NAME[suitOf(i)]}` : HONOR_NAME[i - 27];
}
export function flowerName(f) {
  return f <= 4 ? `Bunga ${f}` : `Musim ${f - 4}`;
}

// ---------- gambar muka ubin (SVG 60×80) ----------
const R = '#b3242b', G = '#17784a', B = '#1e4f9a', K = '#1b2130', GOLD = '#c8962e';
const CJK = `font-family="'Noto Serif TC','Noto Serif SC','Songti SC',serif" font-weight="900" text-anchor="middle"`;

function dot(x, y, r, c) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="${(r * 0.3).toFixed(2)}"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.42).toFixed(2)}" fill="${c}"/>`;
}
const DOTS = {
  1: () => `${dot(30, 40, 21, G)}<circle cx="30" cy="40" r="11" fill="none" stroke="${R}" stroke-width="2.4"/>` +
    [0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k * Math.PI) / 4; return `<circle cx="${(30 + 15.5 * Math.cos(a)).toFixed(1)}" cy="${(40 + 15.5 * Math.sin(a)).toFixed(1)}" r="1.6" fill="${B}"/>`; }).join('') +
    `<circle cx="30" cy="40" r="4.5" fill="${R}"/>`,
  2: () => dot(30, 22, 11, G) + dot(30, 58, 11, B),
  3: () => dot(14, 16, 9, B) + dot(30, 40, 9, R) + dot(46, 64, 9, G),
  4: () => dot(17, 22, 10, B) + dot(43, 22, 10, G) + dot(17, 58, 10, G) + dot(43, 58, 10, B),
  5: () => dot(15, 17, 9, B) + dot(45, 17, 9, G) + dot(30, 40, 9, R) + dot(15, 63, 9, G) + dot(45, 63, 9, B),
  6: () => dot(18, 15, 8.5, G) + dot(42, 15, 8.5, G) + [42, 65].map((y) => dot(18, y, 8.5, R) + dot(42, y, 8.5, R)).join(''),
  7: () => dot(13, 11, 7.5, G) + dot(30, 19, 7.5, G) + dot(47, 27, 7.5, G) + [47, 68].map((y) => dot(19, y, 7.5, R) + dot(41, y, 7.5, R)).join(''),
  8: () => [12, 31, 50, 69].map((y) => dot(19, y, 7.5, B) + dot(41, y, 7.5, B)).join(''),
  9: () => [[16, B], [40, R], [64, G]].map(([y, c]) => [13, 30, 47].map((x) => dot(x, y, 7.5, c)).join('')).join(''),
};

function stick(x, y, h, c) {
  const t = y - h / 2;
  return `<rect x="${x - 3}" y="${t}" width="6" height="${h}" rx="3" fill="${c}"/>` +
    `<rect x="${x - 3.8}" y="${y - 1.2}" width="7.6" height="2.4" rx="1.2" fill="${c}"/>` +
    `<rect x="${x - 3.8}" y="${t}" width="7.6" height="2.4" rx="1.2" fill="${c}"/>` +
    `<rect x="${x - 3.8}" y="${t + h - 2.4}" width="7.6" height="2.4" rx="1.2" fill="${c}"/>` +
    `<line x1="${x - 0.8}" y1="${t + 3}" x2="${x - 0.8}" y2="${t + h - 3}" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>`;
}
const BAMBOO = {
  1: () => `<path d="M24 62 l-7 12 M30 63 v13 M36 62 l7 12" stroke="${R}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<ellipse cx="30" cy="46" rx="12.5" ry="17" fill="${G}"/>` +
    `<path d="M30 33 q11 9 0 27 q-11 -18 0 -27z" fill="${B}"/>` +
    `<circle cx="30" cy="22" r="7.5" fill="${R}"/><circle cx="32.4" cy="20.4" r="1.7" fill="#fffaf0"/>` +
    `<path d="M37 21.5 l7 2.5 -7 2.5z" fill="${GOLD}"/>`,
  2: () => stick(30, 22, 26, G) + stick(30, 58, 26, B),
  3: () => stick(30, 22, 26, G) + stick(19, 58, 26, B) + stick(41, 58, 26, B),
  4: () => stick(19, 22, 26, B) + stick(41, 22, 26, G) + stick(19, 58, 26, G) + stick(41, 58, 26, B),
  5: () => stick(15, 21, 25, G) + stick(45, 21, 25, B) + stick(30, 40, 25, R) + stick(15, 59, 25, B) + stick(45, 59, 25, G),
  6: () => [14, 30, 46].map((x) => stick(x, 22, 26, G) + stick(x, 58, 26, B)).join(''),
  7: () => stick(30, 13, 18, R) + [14, 30, 46].map((x) => stick(x, 41, 20, G) + stick(x, 66, 20, G)).join(''),
  8: () => [10.5, 23.5, 36.5, 49.5].map((x) => stick(x, 22, 26, G) + stick(x, 58, 26, G)).join(''),
  9: () => [[14, G], [30, R], [46, B]].map(([x, c]) => [15, 40, 65].map((y) => stick(x, y, 19, c)).join('')).join(''),
};

function faceSVG(inner) {
  return `<svg viewBox="0 0 60 80" aria-hidden="true">${inner}</svg>`;
}
const memo = new Map();

function tileFace(i) {
  if (memo.has(i)) return memo.get(i);
  let inner;
  if (i < 9) {
    inner = `<text x="30" y="35" font-size="27" fill="${K}" ${CJK}>${NUM_CH[i]}</text>` +
      `<text x="30" y="71" font-size="31" fill="${R}" ${CJK}>萬</text>`;
  } else if (i < 18) inner = DOTS[i - 8]();
  else if (i < 27) inner = BAMBOO[i - 17]();
  else if (i === 31) {
    inner = `<rect x="12" y="13" width="36" height="54" rx="4" fill="none" stroke="${B}" stroke-width="3.2"/>` +
      `<rect x="17.5" y="18.5" width="25" height="43" rx="2" fill="none" stroke="${B}" stroke-width="1.2"/>`;
  } else {
    const col = i === 33 ? R : i === 32 ? G : K;
    inner = `<text x="30" y="55" font-size="42" fill="${col}" ${CJK}>${HONOR_CH[i - 27]}</text>`;
  }
  const svg = faceSVG(inner);
  memo.set(i, svg);
  return svg;
}

function flowerFace(f) {
  const key = `f${f}`;
  if (memo.has(key)) return memo.get(key);
  const season = f > 4;
  const svg = faceSVG(
    `<text x="10" y="17" font-size="13" fill="${season ? G : B}" ${CJK}>${season ? f - 4 : f}</text>` +
    `<text x="31" y="58" font-size="34" fill="${season ? G : R}" ${CJK}>${FLOWER_CH[f - 1]}</text>` +
    `<path d="M10 70 q20 -6 40 0" stroke="${GOLD}" stroke-width="1.6" fill="none"/>`,
  );
  memo.set(key, svg);
  return svg;
}

export function tileHTML(i, extra = '') {
  return `<span class="tile ${extra}" data-t="${i}" role="img" aria-label="${tileName(i)}">${tileFace(i)}</span>`;
}
export function flowerHTML(f, extra = '') {
  return `<span class="tile ${extra}" data-f="${f}" role="img" aria-label="${flowerName(f)}">${flowerFace(f)}</span>`;
}
/** Ubin angin kecil untuk penanda kursi. */
export function windTileHTML(w, extra = '') {
  return tileHTML(windTile(w), `mini ${extra}`);
}

export function countsOf(tiles) {
  const c = new Array(TILE_TYPES).fill(0);
  for (const t of tiles) c[t]++;
  return c;
}
