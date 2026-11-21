// Aperçu des types de cartes : écrit une image PNG par type et valide 12 graines. Lancer : npx tsx tests/maps.ts [taille]
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { generateMap, SIZES } from '../src/mapgen/index';
import { MAP_KINDS, KINDS_4P } from '../src/mapgen/terrain';

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(w: number, h: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const size = (process.argv[2] as keyof typeof SIZES) || 'moyenne';
const pal = [[150, 86, 52], [186, 112, 68], [222, 150, 98], [120, 110, 100], [8, 6, 16]];
for (const k of MAP_KINDS.filter((m) => KINDS_4P.has(m.key) && (!process.argv[3] || process.argv[3].split(',').includes(m.key)))) {
  let ok = 0; const fails: string[] = [];
  for (let s = 1; s <= 12; s++) { const g = generateMap(1000 + s * 77, SIZES[size], k.key, 4); if (g.report.ok) ok++; else fails.push(g.report.reasons.join('/')); }
  const g = generateMap(4242, SIZES[size], k.key, 4), t = g.terrain, n = t.n, rgb = new Uint8Array(n * n * 3);
  for (let k2 = 0; k2 < n * n; k2++) { const lv = t.rampMask[k2] ? 3 : t.levels[k2]; const c = t.voidMask[k2] ? pal[4] : lv === 3 && !t.rampMask[k2] ? [90, 80, 74] : t.rampMask[k2] ? [240, 205, 150] : pal[lv]; rgb.set(c, k2 * 3); }
  const dot = (x: number, z: number, c: number[], r = 2) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = Math.round(x + t.ext + dx), j = Math.round(z + t.ext + dz); if (i >= 0 && j >= 0 && i < n && j < n) rgb.set(c, (j * n + i) * 3); } };
  for (const r of g.objects.resources) dot(r.x, r.z, r.kind === 'solarite' ? [255, 170, 30] : r.kind === 'glace' ? [200, 240, 255] : [90, 90, 110], 0);
  g.terrain.starts.forEach((s, i) => dot(s.x, s.z, [[40, 120, 255], [230, 50, 40], [60, 220, 60], [190, 100, 255]][i], 4));
  writeFileSync(`tests/out/map4_${k.key}_${size}.png`, png(n, n, rgb));
  console.log(`${k.nom.padEnd(18)} ${ok}/12 valides  essai=${g.attempt} ${g.report.ok ? '' : g.report.reasons.join(' / ')}  ${fails.slice(0, 2).join(' | ')}`);
}
