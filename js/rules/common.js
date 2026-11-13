import { suitOf, isHonor, isDragon, isWind, isTermOrHonor, windTile, tileName, flowerName } from '../tiles.js';

export const TYPE_NAME = { chow: 'Chow', pung: 'Pung', kong: 'Kong', pair: 'Pasang' };

export function groupLabel(g, open) {
  const base = `${TYPE_NAME[g.type]} ${tileName(g.tile)}`;
  if (g.type === 'pair') return base;
  return `${base} (${open ? 'terbuka' : 'tertutup'})`;
}

/** Ciri-ciri tangan yang dipakai banyak aturan. */
export function features(groups, tiles, open) {
  const melds = groups.filter((g) => g.type !== 'pair');
  const pair = groups.find((g) => g.type === 'pair');
  const suits = new Set(tiles.filter((t) => !isHonor(t)).map(suitOf));
  const hasHonor = tiles.some(isHonor);
  const pungLike = melds.filter((g) => g.type === 'pung' || g.type === 'kong');
  return {
    melds,
    pair,
    suits,
    hasHonor,
    allChows: melds.length > 0 && melds.every((g) => g.type === 'chow'),
    noChows: melds.length > 0 && melds.every((g) => g.type !== 'chow'),
    concealed: groups.every((g) => !open[g.key]),
    fullFlush: suits.size === 1 && !hasHonor,
    halfFlush: suits.size === 1 && hasHonor,
    allHonors: suits.size === 0 && tiles.length > 0,
    noSimples: tiles.length > 0 && tiles.every(isTermOrHonor),
    dragonPungs: pungLike.filter((g) => isDragon(g.tile)).length,
    windPungs: pungLike.filter((g) => isWind(g.tile)).length,
    pairDragon: !!pair && isDragon(pair.tile),
    pairWind: !!pair && isWind(pair.tile),
    pungLike,
  };
}

/** Peringatan jumlah ubin tangan yang kalah: harus 13 (tiap kong dihitung 3). */
export function loserCountWarning(counts) {
  let n = 0;
  for (const x of counts) n += x === 4 ? 3 : x;
  if (!n || n === 13) return null;
  return `Ada ${n} ubin — tangan yang kalah biasanya 13 ubin (kong dihitung 3). Cek lagi ya.`;
}

export const ownFlowers =(flowers, seat) => flowers.filter((f) => f === seat || f === seat + 4);
export { windTile, tileName, flowerName, isDragon, isWind, isTermOrHonor };

/** Gabungkan transfer jadi saldo bersih per pemain. */
export function netOf(transfers) {
  const net = [0, 0, 0, 0];
  for (const t of transfers) {
    net[t.from] -= t.amt;
    net[t.to] += t.amt;
  }
  return net;
}

/**
 * Cara ubin menang "masuk" ke tiap set: pasang (tunggu pasangan), chow tengah, chow tepi,
 * chow dua sisi, atau melengkapi pung. Kalau ubin menang tidak diketahui -> [null].
 */
export function waitKinds(groups, winTile) {
  if (winTile == null) return [null];
  const out = [];
  for (const g of groups) {
    if (g.type === 'pair' && g.tile === winTile) out.push({ kind: 'single' });
    else if (g.type === 'pung' && g.tile === winTile) out.push({ kind: 'pung', key: g.key });
    else if (g.type === 'chow' && winTile >= g.tile && winTile <= g.tile + 2) {
      const off = winTile - g.tile, n = (g.tile % 9) + 1;
      if (off === 1) out.push({ kind: 'closed' });
      else if ((off === 2 && n === 1) || (off === 0 && n === 7)) out.push({ kind: 'edge' });
      else out.push({ kind: 'open' });
    }
  }
  return out.length ? out : [{ kind: 'single' }]; // 7 pasang / 13 yatim
}

/**
 * Versi-versi tangan untuk tiap cara ubin menang masuk. Isi extras otomatis:
 * waitKind ('single'|'closed'|'edge'|'open'|'pung'), oneTile (hanya 1 macam ubin yang ditunggu).
 * ronPung = kunci pung yang dilengkapi dari buangan.
 */
export function waitVariants(p, groups) {
  if (p.winTile == null) return [p];
  const seen = new Set();
  return waitKinds(groups, p.winTile).filter((o) => {
    const k = `${o.kind}|${o.key || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((o) => ({
    ...p,
    // Pung yang dilengkapi buangan: dihitung terbuka untuk nilai pung saja, tangan tetap "tertutup".
    win: { ...p.win, extras: { ...p.win.extras, waitKind: o.kind, oneTile: p.waitCount === 1, ronPung: o.kind === 'pung' && !p.win.selfDrawn ? o.key : null } },
  }));
}
