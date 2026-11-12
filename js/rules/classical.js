// Aturan Klasik (gaya Babcock / Chinese Classical): SEMUA pemain menghitung tangannya.
// Pemenang dibayar penuh oleh 3 pemain lain; yang kalah saling bayar selisih poin.
// Dealer (Timur) bayar/terima dobel.
import { countsOf } from '../tiles.js';
import { decomposeWinning, partialSets, isThirteenOrphans } from '../decompose.js';
import { features, groupLabel, ownFlowers, netOf, windTile, tileName, flowerName, isDragon, isTermOrHonor, loserCountWarning } from './common.js';

export const id = 'classical';
export const name = 'Klasik (semua pemain hitung)';
export const desc = 'Keempat pemain menghitung poin tangannya (pung, kong, bunga, pasang naga, dll). Pemenang dibayar 3 pemain lain sebesar skornya. Sesama yang kalah saling bayar selisih skor. Gaya meja keluarga yang paling umum.';
export const needsAllHands = true;
export const unit = 'poin';

export const defaults = { limit: 1000, eastDouble: true, roundUp: true };

export const settingsSpec = [
  { key: 'limit', label: 'Batas poin satu tangan (limit)', type: 'number', info: 'Skor satu tangan tidak bisa lebih dari angka ini. Tangan istimewa (tiga naga besar, empat angin besar, semua kehormatan, 13 yatim) langsung dapat skor limit.' },
  { key: 'eastDouble', label: 'Dealer (Timur) bayar & terima dobel', type: 'bool', info: 'Kalau dealer menang, tiap pemain bayar 2× ke dealer. Kalau dealer kalah, dealer bayar 2×. Selisih antara dealer dan pemain lain juga 2×.' },
  { key: 'roundUp', label: 'Bulatkan skor ke atas ke puluhan', type: 'bool', info: 'Contoh: skor 52 jadi 60, skor 48 jadi 50.' },
];

export const winExtras = [
  { key: 'singleWait', label: 'Tunggu 1 ubin saja (+2)', info: 'Sebelum menang kamu cuma menunggu SATU macam ubin. Contoh: punya 4 dan 6 bambu, tinggal butuh 5 bambu. Atau semua set sudah jadi, tinggal menunggu pasangan untuk 1 ubin.' },
  { key: 'lastTile', label: 'Ubin terakhir tembok (×2)', info: 'Menang pakai ubin paling terakhir di tembok (atau ubin buangan paling terakhir sebelum permainan seri). Skor dikali 2.' },
  { key: 'replacement', label: 'Dari ubin pengganti kong (×2)', info: 'Setelah membuat kong, kamu ambil 1 ubin pengganti dari ujung tembok, dan ubin itu yang membuatmu menang. Skor dikali 2.' },
  { key: 'robKong', label: 'Merampok kong (×2)', info: 'Pemain lain menambah 1 ubin ke pung terbukanya supaya jadi kong, padahal ubin itu yang kamu tunggu. Kamu boleh "merampok" ubin itu untuk menang. Skor dikali 2.' },
];

function meldPoints(g, open) {
  const th = isTermOrHonor(g.tile);
  if (g.type === 'pung') return (th ? 4 : 2) * (open ? 1 : 2);
  if (g.type === 'kong') return (th ? 16 : 8) * (open ? 1 : 2);
  return 0;
}

function pairPoints(tile, seat, prevailing) {
  const items = [];
  if (isDragon(tile)) items.push({ label: `Pasang naga ${tileName(tile)}`, pts: 2 });
  if (tile === windTile(seat)) items.push({ label: `Pasang angin kursi sendiri`, pts: 2 });
  if (tile === windTile(prevailing)) items.push({ label: `Pasang angin ronde`, pts: 2 });
  return items;
}

function finish(items, settings, limitLabel) {
  const basic = items.reduce((a, x) => a + (x.pts || 0), 0);
  const dbl = items.reduce((a, x) => a + (x.dbl || 0), 0);
  let total = basic * 2 ** dbl;
  if (settings.roundUp) total = Math.ceil(total / 10) * 10;
  let limited = false;
  if (limitLabel) {
    items.push({ label: `Tangan limit: ${limitLabel}`, note: 'limit' });
    total = settings.limit;
    limited = true;
  } else if (total > settings.limit) {
    total = settings.limit;
    limited = true;
  }
  return { basic, dbl, total, limited, items, summary: limited ? `${total} (limit)` : `${basic} × ${2 ** dbl} = ${total}` };
}

function evaluate(groups, extraPairs, p) {
  const { tiles, flowers, open, isWinner, seat, prevailing, win, settings } = p;
  const items = [];
  for (const g of groups) {
    const o = !!open[g.key];
    const pts = meldPoints(g, o);
    if (pts) items.push({ label: groupLabel(g, o), pts });
    if (g.type === 'pung' || g.type === 'kong') {
      if (isDragon(g.tile)) items.push({ label: `${groupLabel(g, o).split(' (')[0]} — naga`, dbl: 1 });
      if (g.tile === windTile(seat)) items.push({ label: 'Pung angin kursi sendiri', dbl: 1 });
      if (g.tile === windTile(prevailing)) items.push({ label: 'Pung angin ronde', dbl: 1 });
    }
    if (g.type === 'pair') items.push(...pairPoints(g.tile, seat, prevailing));
  }
  // Tangan kalah: hanya satu pasang terbaik yang dihitung.
  if (extraPairs.length) {
    let best = [];
    for (const t of extraPairs) {
      const it = pairPoints(t, seat, prevailing);
      if (it.reduce((a, x) => a + x.pts, 0) > best.reduce((a, x) => a + x.pts, 0)) best = it;
    }
    items.push(...best);
  }
  for (const f of flowers) items.push({ label: flowerName(f), pts: 4 });
  for (const f of ownFlowers(flowers, seat)) items.push({ label: `${flowerName(f)} milik kursi sendiri`, dbl: 1 });

  let limitLabel = null;
  if (isWinner) {
    const F = features(groups, tiles, open);
    const ex = win.extras || {};
    items.push({ label: 'Mahjong (menang)', pts: 20 });
    if (win.selfDrawn) items.push({ label: 'Menang sendiri (tarik tembok)', pts: 2 });
    if (ex.singleWait) items.push({ label: 'Tunggu 1 ubin saja', pts: 2 });
    if (F.noChows) items.push({ label: 'Semua pung/kong (tanpa chow)', dbl: 1 });
    if (F.concealed) items.push({ label: 'Tangan tertutup semua', dbl: 1 });
    if (F.fullFlush) items.push({ label: 'Satu jenis murni', dbl: 3 });
    else if (F.halfFlush) items.push({ label: 'Satu jenis + ubin kehormatan', dbl: 1 });
    if (F.noSimples && !F.allHonors) items.push({ label: 'Hanya ujung (1/9) & kehormatan', dbl: 1 });
    if (F.dragonPungs === 2 && F.pairDragon) items.push({ label: 'Tiga naga kecil', dbl: 1 });
    const basicSoFar = items.reduce((a, x) => a + (x.pts || 0), 0);
    if (F.allChows && basicSoFar === 20 + (win.selfDrawn ? 2 : 0) + (ex.singleWait ? 2 : 0) && !flowers.length)
      items.push({ label: 'Tangan tanpa poin (semua chow)', dbl: 1 });
    if (ex.lastTile) items.push({ label: 'Ubin terakhir tembok', dbl: 1 });
    if (ex.replacement) items.push({ label: 'Ubin pengganti kong', dbl: 1 });
    if (ex.robKong) items.push({ label: 'Merampok kong', dbl: 1 });
    if (F.allHonors) limitLabel = 'Semua ubin kehormatan';
    else if (F.dragonPungs === 3) limitLabel = 'Tiga naga besar';
    else if (F.windPungs === 4) limitLabel = 'Empat angin besar';
  }
  return { groups, ...finish(items, settings, limitLabel) };
}

export function scoreHand(p) {
  const c = countsOf(p.tiles);
  if (p.isWinner) {
    if (isThirteenOrphans(c)) {
      return { ok: true, groups: [], ...finish([{ label: 'Mahjong (menang)', pts: 20 }], p.settings, 'Tiga belas yatim (13 orphans)') };
    }
    const cands = decomposeWinning(c);
    if (!cands.length) return { ok: false, error: 'Ubin belum membentuk tangan menang (4 set + 1 pasang).' };
    let best = null;
    for (const groups of cands) {
      const r = evaluate(groups, [], p);
      if (!best || r.total > best.total) best = r;
    }
    return { ok: true, ...best };
  }
  const { groups, pairs } = partialSets(c);
  return { ok: true, ...evaluate(groups, pairs, p), warning: loserCountWarning(c) };
}

/** results[i].total = skor tiap pemain. */
export function settle({ results, winner, dealer, settings }) {
  const transfers = [];
  if (winner == null) return { transfers, net: [0, 0, 0, 0] };
  const mult = (a, b) => (settings.eastDouble && (a === dealer || b === dealer) ? 2 : 1);
  const s = results.map((r) => (r && r.ok ? r.total : 0));
  const losers = [0, 1, 2, 3].filter((i) => i !== winner);
  for (const l of losers) transfers.push({ from: l, to: winner, amt: s[winner] * mult(l, winner), why: 'bayar pemenang' });
  for (let x = 0; x < losers.length; x++) {
    for (let y = x + 1; y < losers.length; y++) {
      const a = losers[x], b = losers[y];
      const diff = (s[a] - s[b]) * mult(a, b);
      if (diff > 0) transfers.push({ from: b, to: a, amt: diff, why: 'selisih' });
      else if (diff < 0) transfers.push({ from: a, to: b, amt: -diff, why: 'selisih' });
    }
  }
  return { transfers, net: netOf(transfers) };
}
