// Joins OpenStreetMap building outlines with the GWR (year built, floors) for one municipality.
// Usage: node scripts/prep_city.js <gebaeude_batiment_edificio.csv> <osm_buildings.json> <osm_context.json> <out_dir> [GGDENR=261]
// OSM inputs come from Overpass ("way[building](area); out geom;" and a context query: water, rivers, roads, rail, places, boundary).
// Output: city.txt = base64 of: Uint32[nB, nV, E0, N0], Uint32 ringStart[nB+1], Uint16 xy[2*nV] (0.5 m units from E0/N0),
//         Uint16 year[nB] (0 = "before 1919", exact year unknown), Uint8 floors[nB], Uint8 kind[nB] (GKAT index)
//         city_ctx.json = map context in metres from E0/N0
const fs = require('fs'), path = require('path');
const [csvPath, bPath, cPath, out, muniArg] = process.argv.slice(2);
if (!out) { console.error('usage: node scripts/prep_city.js <gwr.csv> <osm_buildings.json> <osm_context.json> <out_dir> [GGDENR]'); process.exit(1); }
const MUNI = muniArg || '261';

// swisstopo approximate WGS84 -> LV95 (about 1 m)
function toLV95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3];
}

// ---- GWR points for the municipality ----
const PERIOD = { 8012: [1919, 1945], 8013: [1946, 1960], 8014: [1961, 1970], 8015: [1971, 1980], 8016: [1981, 1985], 8017: [1986, 1990],
  8018: [1991, 1995], 8019: [1996, 2000], 8020: [2001, 2005], 8021: [2006, 2010], 8022: [2011, 2015], 8023: [2016, 2025] };
const KIND = ['1020', '1030', '1040', '1060', '1080', '1010']; // GKAT, index stored per building
const rand = id => ((id * 2654435761) >>> 0) / 4294967296;
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/), head = lines[0].split('\t'), c = Object.fromEntries(head.map((k, i) => [k, i]));
const pts = [];
let noYear = 0, before1919 = 0;
for (let i = 1; i < lines.length; i++) {
  const r = lines[i].split('\t');
  if (r[c.GGDENR] !== MUNI || !['1004', '1005'].includes(r[c.GSTAT])) continue;
  const id = +r[c.EGID]; let year = +r[c.GBAUJ] || 0; const per = r[c.GBAUP];
  if (!year && per === '8011') { year = 0; before1919++; }
  else if (!year && PERIOD[per]) { const [a, b] = PERIOD[per]; year = a + Math.floor(rand(id) * (b - a + 1)); }
  else if (!year) { noYear++; continue; }
  pts.push({ E: +r[c.GKODE], N: +r[c.GKODN], year, floors: Math.min(255, +r[c.GASTW] || 0), area: +r[c.GAREA] || 0, kind: Math.max(0, KIND.indexOf(r[c.GKAT])) });
}
const G = 25, grid = new Map(), gk = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`;
for (const p of pts) { const k = gk(p.E, p.N); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }

// ---- buildings ----
function inside(x, y, ring) { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; } return o; }
function edgeDist(x, y, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
const NEAR = 3; // metres: GWR point may sit just outside the OSM outline
const blds = []; let unmatched = 0;
for (const w of JSON.parse(fs.readFileSync(bPath, 'utf8')).elements) {
  if (w.type !== 'way' || !w.geometry || w.geometry.length < 4) continue;
  const ring = w.geometry.map(g => toLV95(g.lat, g.lon)); ring.pop(); // drop closing vertex
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const hits = [];
  for (let gx = Math.floor((x0 - NEAR) / G); gx <= Math.floor((x1 + NEAR) / G); gx++)
    for (let gy = Math.floor((y0 - NEAR) / G); gy <= Math.floor((y1 + NEAR) / G); gy++)
      for (const p of grid.get(`${gx},${gy}`) || []) if (inside(p.E, p.N, ring) || edgeDist(p.E, p.N, ring) <= NEAR) hits.push(p);
  if (!hits.length) { unmatched++; continue; }
  const main = hits.reduce((a, b) => (b.area > a.area ? b : a)); // largest register building inside the outline sets the year
  blds.push({ ring, year: main.year, floors: Math.max(...hits.map(h => h.floors)), kind: main.kind });
}
blds.sort((a, b) => a.year - b.year);

// ---- pack ----
let E0 = Infinity, N0 = Infinity;
for (const b of blds) for (const [x, y] of b.ring) { E0 = Math.min(E0, x); N0 = Math.min(N0, y); }
E0 = Math.floor(E0); N0 = Math.floor(N0);
const nB = blds.length, nV = blds.reduce((s, b) => s + b.ring.length, 0);
const buf = new ArrayBuffer(16 + 4 * (nB + 1) + 4 * nV + 2 * nB + 2 * nB);
let o = 0;
new Uint32Array(buf, 0, 4).set([nB, nV, E0, N0]); o = 16;
const rs = new Uint32Array(buf, o, nB + 1); o += 4 * (nB + 1);
const xy = new Uint16Array(buf, o, 2 * nV); o += 4 * nV;
const yr = new Uint16Array(buf, o, nB); o += 2 * nB;
const fl = new Uint8Array(buf, o, nB), kd = new Uint8Array(buf, o + nB, nB);
let v = 0;
blds.forEach((b, i) => {
  rs[i] = v;
  for (const [x, y] of b.ring) {
    const qx = Math.round((x - E0) * 2), qy = Math.round((y - N0) * 2);
    if (qx < 0 || qx > 65535 || qy < 0 || qy > 65535) throw new Error('extent too large for Uint16 at 0.5 m');
    xy[2 * v] = qx; xy[2 * v + 1] = qy; v++;
  }
  yr[i] = b.year; fl[i] = b.floors; kd[i] = b.kind;
});
rs[nB] = v;

// ---- context: water, rivers, roads, rail, places, boundary ----
const rel = ([x, y]) => [Math.round(x - E0), Math.round(y - N0)];
function simplify(p, tol) { // Douglas-Peucker on [x,y] arrays
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = edgeDist(p[i][0], p[i][1], [p[a], p[b]]); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
function joinRings(ways) { // merge relation member ways into closed rings
  const segs = ways.map(w => w.slice()), rings = [];
  while (segs.length) {
    let cur = segs.pop();
    for (let changed = true; changed && !(cur.length > 2 && cur[0] === cur[cur.length - 1]);) {
      changed = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = cur[cur.length - 1];
        if (s[0] === end) cur = cur.concat(s.slice(1));
        else if (s[s.length - 1] === end) cur = cur.concat(s.slice(0, -1).reverse());
        else if (s[s.length - 1] === cur[0]) cur = s.concat(cur.slice(1));
        else if (s[0] === cur[0]) cur = s.slice().reverse().concat(cur.slice(1));
        else continue;
        segs.splice(i, 1); changed = true; break;
      }
    }
    rings.push(cur);
  }
  return rings;
}
const ctxEls = JSON.parse(fs.readFileSync(cPath, 'utf8')).elements;
const geo = g => g.map(q => toLV95(q.lat, q.lon));
const ctx = { water: [], rivers: [], roads: [], rail: [], places: [], boundary: [] };
const RANK = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3 };
for (const e of ctxEls) {
  const t = e.tags || {};
  if (e.type === 'node' && t.name) ctx.places.push({ name: t.name, kind: t.place, at: rel(toLV95(e.lat, e.lon)) });
  if (e.type === 'way' && e.geometry) {
    const line = geo(e.geometry);
    if (t.natural === 'water') ctx.water.push(simplify(line, 1.5).map(rel));
    else if (t.waterway === 'river') ctx.rivers.push(simplify(line, 2).map(rel));
    else if (t.highway in RANK) ctx.roads.push({ r: RANK[t.highway], p: simplify(line, 2).map(rel) });
    else if (t.railway === 'rail') ctx.rail.push(simplify(line, 2).map(rel));
  }
  if (e.type === 'relation' && e.members) {
    const outer = e.members.filter(m => m.type === 'way' && m.geometry && m.role !== 'inner').map(m => m.geometry.map(q => `${q.lat},${q.lon}`));
    const rings = joinRings(outer).map(r => simplify(geo(r.map(s => s.split(',').map(Number)).map(([la, lo]) => ({ lat: la, lon: lo }))), 2).map(rel));
    if (t.natural === 'water') ctx.water.push(...rings);
    else if (t.boundary === 'administrative') ctx.boundary.push(...rings);
  }
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'city.txt'), Buffer.from(buf).toString('base64'));
fs.writeFileSync(path.join(out, 'city_ctx.json'), JSON.stringify(ctx));
const placeKinds = ctx.places.reduce((m, p) => (m[p.kind] = (m[p.kind] || 0) + 1, m), {});
console.log({ gwrPoints: pts.length, noYear, before1919, osmMatched: nB, unmatched, vertices: nV, bytes: buf.byteLength,
  ctx: Object.fromEntries(Object.entries(ctx).map(([k, a]) => [k, a.length])), placeKinds, E0, N0,
  years: [blds.find(b => b.year).year, blds[nB - 1].year], ctxBytes: JSON.stringify(ctx).length });
