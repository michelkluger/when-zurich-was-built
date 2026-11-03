// Packs the GWR building CSV (public.madd.bfs.admin.ch/<canton>.zip) into a compact binary for the map.
// Usage: node scripts/prep_gwr.js <gebaeude_batiment_edificio.csv> <out_dir>
// Output: buildings.txt = base64 of: header Uint32[n, minE, minN], then Uint16 x[n], y[n], area[n], Uint8 built[n], demo[n], floors[n], res[n]
//         meta.json = municipality label positions
const fs = require('fs'), path = require('path');
const [csv, out] = process.argv.slice(2);
if (!csv || !out) { console.error('usage: node scripts/prep_gwr.js <csv> <out_dir>'); process.exit(1); }

const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/); // CRLF: last column (GEXPDAT) would carry a \r
const head = lines[0].split('\t');
const c = Object.fromEntries(head.map((k, i) => [k, i]));

// GBAUP period codes -> year range; used only when GBAUJ (exact year) is missing
const PERIOD = { 8012: [1919, 1945], 8013: [1946, 1960], 8014: [1961, 1970], 8015: [1971, 1980], 8016: [1981, 1985],
  8017: [1986, 1990], 8018: [1991, 1995], 8019: [1996, 2000], 8020: [2001, 2005], 8021: [2006, 2010],
  8022: [2011, 2015], 8023: [2016, 2025] };
const rand = id => ((id * 2654435761) >>> 0) / 4294967296; // deterministic per building
const KEEP = new Set(['1004', '1005', '1007']); // existing, unusable, demolished
const RES = new Set(['1020', '1030', '1040']);

const rows = [], byMuni = {};
let skipped = 0;
for (let i = 1; i < lines.length; i++) {
  const r = lines[i].split('\t');
  if (r.length < head.length - 1 || !KEEP.has(r[c.GSTAT])) continue;
  const id = +r[c.EGID], E = +r[c.GKODE], N = +r[c.GKODN];
  let year = +r[c.GBAUJ] || 0;
  const per = r[c.GBAUP];
  if (!year && per === '8011') year = 1800; // "before 1919": always part of the starting stock
  else if (!year && PERIOD[per]) { const [a, b] = PERIOD[per]; year = a + Math.floor(rand(id) * (b - a + 1)); }
  const demo = r[c.GSTAT] === '1007' ? +r[c.GABBJ] || 0 : 0;
  if (!year || !E || !N || (r[c.GSTAT] === '1007' && (!demo || demo < year))) { skipped++; continue; }
  rows.push({ E, N, year: Math.max(1800, year), demo, floors: Math.min(255, +r[c.GASTW] || 0),
    area: Math.min(65535, +r[c.GAREA] || 0), res: RES.has(r[c.GKAT]) ? 1 : 0 });
  if (!demo) (byMuni[r[c.GGDENAME]] ||= []).push([E, N]);
}
rows.sort((a, b) => a.year - b.year); // older first, so newer buildings draw on top

const n = rows.length;
const ext = (k, f) => rows.reduce((m, r) => f(m, r[k]), rows[0][k]); // spread (...) overflows the stack at 400k
const minE = Math.floor(ext('E', Math.min)), minN = Math.floor(ext('N', Math.min));
const spanE = ext('E', Math.max) - minE, spanN = ext('N', Math.max) - minN;
if (spanE > 65535 || spanN > 65535) throw new Error(`extent ${spanE}x${spanN} m does not fit in Uint16 at 1 m`);

const buf = new ArrayBuffer(12 + n * 10);
new Uint32Array(buf, 0, 3).set([n, minE, minN]);
const x = new Uint16Array(buf, 12, n), y = new Uint16Array(buf, 12 + 2 * n, n), area = new Uint16Array(buf, 12 + 4 * n, n);
const built = new Uint8Array(buf, 12 + 6 * n, n), demo = new Uint8Array(buf, 12 + 7 * n, n);
const floors = new Uint8Array(buf, 12 + 8 * n, n), res = new Uint8Array(buf, 12 + 9 * n, n);
rows.forEach((r, i) => {
  x[i] = Math.round(r.E - minE); y[i] = Math.round(r.N - minN); area[i] = r.area;
  built[i] = Math.min(255, r.year - 1800); demo[i] = r.demo ? r.demo - 1800 : 0; floors[i] = r.floors; res[i] = r.res;
});

// Label the 14 municipalities with the most standing buildings, at their median building position
const median = a => a.sort((p, q) => p - q)[a.length >> 1];
const labels = Object.entries(byMuni).sort((a, b) => b[1].length - a[1].length).slice(0, 14)
  .map(([name, pts]) => ({ name, E: median(pts.map(p => p[0])), N: median(pts.map(p => p[1])), n: pts.length }));

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'buildings.txt'), Buffer.from(buf).toString('base64')); // base64: artifacts don't serve raw binary
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ labels, exported: lines[1].split('\t')[c.GEXPDAT] }));
console.log({ n, skipped, demolished: rows.filter(r => r.demo).length, minE, minN, spanE, spanN,
  years: [rows[0].year, rows[n - 1].year], bytes: buf.byteLength, labels: labels.map(l => l.name).join(', ') });
