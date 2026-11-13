// Memecah tangan menjadi set: chow (urut), pung (3 sama), kong (4 sama), pair (pasang).
// group = { type: 'chow'|'pung'|'kong'|'pair', tile: indeksUbinPertama, key: 'pung-31' }

/** Semua cara tangan menang tersusun dari 4 set + 1 pasang (kong boleh). */
export function decomposeWinning(counts) {
  const c = counts.slice();
  const out = [];
  for (let i = 0; i < 34; i++) {
    if (c[i] < 2) continue;
    c[i] -= 2;
    melds(c, 0, [{ type: 'pair', tile: i }], out);
    c[i] += 2;
  }
  return out.filter((g) => g.length === 5).map(withKeys);
}

function melds(c, start, acc, out) {
  let i = start;
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) {
    out.push(acc.slice());
    return;
  }
  if (c[i] >= 4) {
    c[i] -= 4; acc.push({ type: 'kong', tile: i });
    melds(c, i, acc, out);
    acc.pop(); c[i] += 4;
  }
  if (c[i] >= 3) {
    c[i] -= 3; acc.push({ type: 'pung', tile: i });
    melds(c, i, acc, out);
    acc.pop(); c[i] += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--; acc.push({ type: 'chow', tile: i });
    melds(c, i, acc, out);
    acc.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
  }
}

/** Kunci stabil per set, supaya pilihan "terbuka/tertutup" tetap nempel walau dihitung ulang. */
export function withKeys(groups) {
  const seen = {};
  return groups.map((g) => {
    const base = `${g.type}-${g.tile}`;
    seen[base] = (seen[base] || 0) + 1;
    return { ...g, key: seen[base] > 1 ? `${base}#${seen[base]}` : base };
  });
}

/** Tangan yang kalah: ambil kong & pung yang ada, plus pasang-pasang (aturan memilih mana yang dihitung). */
export function partialSets(counts) {
  const groups = [];
  const pairs = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 4) groups.push({ type: 'kong', tile: i });
    else if (counts[i] === 3) groups.push({ type: 'pung', tile: i });
    else if (counts[i] === 2) pairs.push(i);
  }
  return { groups: withKeys(groups), pairs };
}

export function isSevenPairs(counts) {
  let pairs = 0;
  for (const x of counts) {
    if (x === 2) pairs++;
    else if (x !== 0) return false;
  }
  return pairs === 7;
}

const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
export function isThirteenOrphans(counts) {
  let total = 0;
  for (let i = 0; i < 34; i++) {
    total += counts[i];
    if (ORPHANS.includes(i)) { if (counts[i] < 1) return false; }
    else if (counts[i]) return false;
  }
  return total === 14;
}

/** Tangan 14 ubin sudah menang? (4 set + pasang, 7 pasang, atau 13 yatim) */
export function isWinningCounts(counts) {
  return isThirteenOrphans(counts) || isSevenPairs(counts) || decomposeWinning(counts).length > 0;
}

/** Berapa macam ubin yang bisa melengkapi tangan sebelum ubin menang masuk. */
export function waitCount(counts, winTile) {
  if (winTile == null || !counts[winTile]) return 0;
  const c = counts.slice();
  c[winTile]--;
  let n = 0;
  for (let t = 0; t < 34; t++) {
    if (c[t] >= 4) continue;
    c[t]++;
    if (isWinningCounts(c)) n++;
    c[t]--;
  }
  return n;
}
