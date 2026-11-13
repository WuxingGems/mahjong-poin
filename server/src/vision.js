// Baca ubin mahjong dari foto. Pilihan model:
//  - 'free'  : Cloudflare Workers AI (gratis, kurang teliti)
//  - 'haiku' / 'sonnet' / 'opus' : Claude (perlu secret ANTHROPIC_API_KEY di server)
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const FREE_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const FREE_OPTIONS = [FREE_MODEL, '@cf/google/gemma-3-12b-it', '@cf/mistralai/mistral-small-3.1-24b-instruct'];

const CODES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`${n}m`, `${n}p`, `${n}s`]),
  'E', 'S', 'W', 'N', 'Wh', 'Gr', 'Rd', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
];

const PROMPT = `This photo shows one player's mahjong tiles laid out in a row (usually 13 or 14 tiles, more if they have kongs, and possibly some flower tiles).
The row may be horizontal OR vertical (photo taken in portrait), and tiles may appear rotated or upside down — read each tile face in whatever orientation it has. For a vertical row, read from top to bottom.
Identify EVERY tile from left to right. Use these codes:
- 1m..9m = Characters / 萬 (a Chinese numeral 一二三四五六七八九 above a red 萬 or 万)
- 1p..9p = Dots / Circles / 筒 (count the circles)
- 1s..9s = Bamboo / 條 / 索 (count the sticks; 1s is usually a bird)
- E, S, W, N = winds 東 南 西 北
- Wh = white dragon (blank tile or a blue rectangle frame, 白)
- Gr = green dragon 發
- Rd = red dragon 中
- F1..F4 = flowers plum 梅, orchid 蘭, chrysanthemum 菊, bamboo 竹 (often numbered 1-4)
- F5..F8 = seasons spring 春, summer 夏, autumn 秋, winter 冬 (often numbered 1-4)
Count carefully: identical tiles side by side must each be listed. Ignore tiles that clearly belong to other players or the wall.

The player may leave visible GAPS between groups of tiles (e.g. exposed sets on the left, the hand in the middle, and the single winning tile apart on the far right).
Report the tiles as "segments": one array per group separated by a clear EMPTY SPACE on the table (at least half a tile wide), in left-to-right order.
IMPORTANT: do NOT split tiles into sets/melds yourself. Tiles that touch each other or sit edge to edge belong to the SAME segment, even if they look like different sets. Most photos have only 1 to 3 segments. If there are no clear empty spaces, return a single segment with all tiles.`;

const SCHEMA = {
  type: 'object',
  properties: {
    segments: { type: 'array', items: { type: 'array', items: { type: 'string', enum: CODES } } },
    notes: { type: 'string' },
  },
  required: ['segments', 'notes'],
  additionalProperties: false,
};

/** Hasil model -> segments (array of array kode). */
function parseLoose(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      if (Array.isArray(o.segments)) return o.segments.filter(Array.isArray).map((s) => s.map(String));
      if (Array.isArray(o.tiles)) return [o.tiles.map(String)];
    } catch { /* lanjut cara kasar */ }
  }
  // cadangan: ambil semua kode yang dikenali dari teks
  const set = new Set(CODES.map((c) => c.toLowerCase()));
  return [(String(text || '').match(/\b([1-9][mps]|E|S|W|N|Wh|Gr|Rd|F[1-8])\b/gi) || []).filter((c) => set.has(c.toLowerCase()))];
}
const result = (segments, model) => ({ segments, tiles: segments.flat(), model });

async function readFree(env, dataUrl, freeModel) {
  if (!env.AI) throw new Error('Pembaca gratis belum aktif di server.');
  const out = await env.AI.run(FREE_OPTIONS.includes(freeModel) ? freeModel : FREE_MODEL, {
    messages: [
      { role: 'system', content: 'You read mahjong tiles from photos and answer ONLY with JSON like {"segments":[["1m","1m","1m"],["2p","3p"]],"notes":""}.' },
      { role: 'user', content: [{ type: 'text', text: `${PROMPT}\n\nAnswer ONLY with JSON: {"segments":[[...codes...],...],"notes":"..."}` }, { type: 'image_url', image_url: { url: dataUrl } }] },
    ],
    max_tokens: 600,
    temperature: 0.1,
  });
  const text = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? out);
  return result(parseLoose(text), 'free');
}

async function readClaude(env, key, dataUrl) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Kunci API Claude belum dipasang di server.');
  const [, mediaType, data] = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/) || [];
  if (!data) throw new Error('Format foto tidak dikenali.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: CLAUDE_MODELS[key],
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: PROMPT },
      ],
    }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return result(parseLoose(text), key);
}

export async function readTiles(env, { image, model, freeModel }) {
  if (typeof image !== 'string' || !image.startsWith('data:image/')) throw new Error('Foto tidak ada.');
  if (image.length > 6_000_000) throw new Error('Foto terlalu besar.');
  if (CLAUDE_MODELS[model]) return readClaude(env, model, image);
  return readFree(env, image, freeModel);
}
