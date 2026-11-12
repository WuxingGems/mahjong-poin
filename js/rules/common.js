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
