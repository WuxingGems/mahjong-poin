// Aturan Hong Kong (faan / 番): hanya tangan pemenang yang dihitung.
// Poin = 2^faan (dibatasi limit). Menang sendiri: 3 pemain bayar. Dari buangan: pembuang bayar lebih.
import { countsOf } from '../tiles.js';
import { decomposeWinning, isSevenPairs, isThirteenOrphans } from '../decompose.js';
import { features, groupLabel, ownFlowers, netOf, windTile, flowerName } from './common.js';

export const id = 'hongkong';
export const name = 'Hong Kong (faan)';
export const desc = 'Hanya tangan pemenang yang dihitung, dalam satuan faan (番). Makin langka susunannya, makin banyak faan. Poin = 2 pangkat faan (3 faan = 8 poin). Yang kalah tidak perlu mengisi ubin.';
export const needsAllHands = false;
export const unit = 'faan';

export const defaults = { minFaan: 3, limitFaan: 10, payMode: 'half', flowersOn: true, sevenPairs: true };

export const settingsSpec = [
  { key: 'minFaan', label: 'Faan minimum untuk menang', type: 'number', info: 'Tangan dengan faan kurang dari ini tidak boleh dinyatakan menang. Umumnya 3 faan, ada juga meja yang pakai 1.' },
  { key: 'limitFaan', label: 'Batas faan (limit)', type: 'number', info: 'Faan lebih dari ini dihitung sama dengan batas. Tangan istimewa (13 yatim, semua kehormatan, dll.) langsung dapat faan batas.' },
  {
    key: 'payMode', label: 'Kalau menang dari buangan', type: 'select', options: [
      ['half', 'Pembuang bayar penuh, 2 lainnya bayar setengah'],
      ['full', 'Pembuang tanggung semua (bayar 2×)'],
    ], info: 'Setengah (半銃): pembuang bayar penuh, 2 pemain lain bayar setengah. Tanggung semua (全銃): hanya pembuang yang bayar, sebesar 2×. Kalau menang tarik sendiri, 3 pemain bayar penuh.',
  },
  { key: 'flowersOn', label: 'Main pakai bunga', type: 'bool', info: 'Bunga milik kursi sendiri +1 faan. Tidak punya bunga sama sekali juga +1 faan.' },
  { key: 'sevenPairs', label: 'Tujuh pasang boleh (4 faan)', type: 'bool', info: 'Tangan berisi 7 pasang (tanpa set) boleh dipakai menang, nilainya 4 faan.' },
];

export const winExtras = [
  { key: 'lastTile', label: 'Ubin terakhir tembok (+1)', info: 'Menang pakai ubin paling terakhir di tembok (atau buangan paling terakhir sebelum seri).' },
  { key: 'replacement', label: 'Dari ubin pengganti kong (+1)', info: 'Setelah membuat kong, kamu ambil 1 ubin pengganti dari ujung tembok, dan ubin itu yang membuatmu menang.' },
  { key: 'robKong', label: 'Merampok kong (+1)', info: 'Pemain lain menambah 1 ubin ke pung terbukanya jadi kong, padahal ubin itu yang kamu tunggu. Kamu ambil ubin itu untuk menang.' },
];

function commonItems(p, concealed) {
  const { flowers, seat, win, settings } = p;
  const items = [];
  const ex = win.extras || {};
  if (win.selfDrawn) items.push({ label: 'Menang sendiri (tarik tembok)', faan: 1 });
  if (concealed) items.push({ label: 'Tangan tertutup', faan: 1 });
  if (settings.flowersOn) {
    if (!flowers.length) items.push({ label: 'Tanpa bunga', faan: 1 });
    for (const f of ownFlowers(flowers, seat)) items.push({ label: `${flowerName(f)} milik kursi sendiri`, faan: 1 });
  }
  if (ex.lastTile) items.push({ label: 'Ubin terakhir tembok', faan: 1 });
  if (ex.replacement) items.push({ label: 'Ubin pengganti kong', faan: 1 });
  if (ex.robKong) items.push({ label: 'Merampok kong', faan: 1 });
  return items;
}

function finish(groups, items, settings, limitLabel) {
  let faan = items.reduce((a, x) => a + (x.faan || 0), 0);
  let limited = false;
  if (limitLabel) {
    items.push({ label: `Tangan limit: ${limitLabel}`, note: 'limit' });
    faan = settings.limitFaan;
    limited = true;
  } else if (faan >= settings.limitFaan) {
    faan = settings.limitFaan;
    limited = true;
  }
  const total = 2 ** faan;
  const warning = faan < settings.minFaan ? `Baru ${faan} faan — kurang dari minimum ${settings.minFaan} faan.` : null;
  return { groups, items, faan, total, limited, warning, summary: `${faan} faan${limited ? ' (limit)' : ''} = ${total} poin` };
}

function evaluate(groups, p) {
  const { tiles, open, seat, prevailing, settings } = p;
  const F = features(groups, tiles, open);
  const items = [];
  for (const g of groups) items.push({ label: groupLabel(g, !!open[g.key]) });
  items.push(...commonItems(p, F.concealed));
  if (F.allChows) items.push({ label: 'Semua chow', faan: 1 });
  if (F.noChows) items.push({ label: 'Semua pung/kong', faan: 3 });
  if (F.fullFlush) items.push({ label: 'Satu jenis murni', faan: 7 });
  else if (F.halfFlush) items.push({ label: 'Satu jenis + kehormatan', faan: 3 });

  if (F.dragonPungs === 3) items.push({ label: 'Tiga naga besar', faan: 8 });
  else if (F.dragonPungs === 2 && F.pairDragon) items.push({ label: 'Tiga naga kecil', faan: 5 });
  else if (F.dragonPungs) items.push({ label: `Pung naga ×${F.dragonPungs}`, faan: F.dragonPungs });

  if (F.windPungs === 3 && F.pairWind) items.push({ label: 'Empat angin kecil', faan: 6 });
  else {
    if (F.pungLike.some((g) => g.tile === windTile(seat))) items.push({ label: 'Pung angin kursi sendiri', faan: 1 });
    if (F.pungLike.some((g) => g.tile === windTile(prevailing))) items.push({ label: 'Pung angin ronde', faan: 1 });
  }
  if (F.noSimples && F.hasHonor && !F.allHonors) items.push({ label: 'Campur ujung (1/9) & kehormatan', faan: 1 });

  let limitLabel = null;
  if (F.allHonors) limitLabel = 'Semua ubin kehormatan';
  else if (F.windPungs === 4) limitLabel = 'Empat angin besar';
  else if (F.noSimples && !F.hasHonor) limitLabel = 'Semua ujung (1 & 9)';
  return finish(groups, items, settings, limitLabel);
}

export function scoreHand(p) {
  if (!p.isWinner) return { ok: true, groups: [], items: [], total: 0, summary: 'Tidak dihitung' };
  const c = countsOf(p.tiles);
  if (isThirteenOrphans(c)) return { ok: true, ...finish([], commonItems(p, true), p.settings, 'Tiga belas yatim (13 orphans)') };
  let best = null;
  for (const groups of decomposeWinning(c)) {
    const r = evaluate(groups, p);
    if (!best || r.total > best.total) best = r;
  }
  if (p.settings.sevenPairs && isSevenPairs(c)) {
    const F = features([], p.tiles, {});
    const items = [{ label: 'Tujuh pasang', faan: 4 }, ...commonItems(p, true)];
    if (F.fullFlush) items.push({ label: 'Satu jenis murni', faan: 7 });
    else if (F.halfFlush) items.push({ label: 'Satu jenis + kehormatan', faan: 3 });
    const r = finish([], items, p.settings, F.allHonors ? 'Semua ubin kehormatan' : null);
    if (!best || r.total > best.total) best = r;
  }
  if (!best) return { ok: false, error: 'Ubin belum membentuk tangan menang (4 set + 1 pasang).' };
  return { ok: true, ...best };
}

export function settle({ results, winner, discarder, selfDrawn, settings }) {
  const transfers = [];
  if (winner == null) return { transfers, net: [0, 0, 0, 0] };
  const B = results[winner]?.total || 0;
  for (const l of [0, 1, 2, 3].filter((i) => i !== winner)) {
    let amt;
    if (selfDrawn) amt = B;
    else if (settings.payMode === 'full') amt = l === discarder ? B * 2 : 0;
    else amt = l === discarder ? B : Math.ceil(B / 2);
    if (amt) transfers.push({ from: l, to: winner, amt, why: selfDrawn ? 'menang sendiri' : l === discarder ? 'pembuang' : 'ikut bayar' });
  }
  return { transfers, net: netOf(transfers) };
}
