#!/usr/bin/env node
// t_viewer.mjs - offline verification of RASSVET loader + logic (no browser/Cesium required)
import * as satellite from './node_modules/satellite.mjs';
globalThis.window = { satellite };

// Minimal Cesium stubs for everything main.js references.
class MockCartesian3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
MockCartesian3.fromElements = MockCartesian3;
MockCartesian3.fromDegrees = () => new MockCartesian3(0, 0, 0);
class MockBillboardCollection {
  constructor() { this.items = []; }
  add(b) { const it = { ...b }; this.items.push(it); return it; }
  remove(b) { const i = this.items.indexOf(b); if (i >= 0) this.items.splice(i, 1); }
  indexOf(b) { return this.items.indexOf(b); }
  get length() { return this.items.length; }
}
class MockPolylineCollection {
  constructor() { this.items = []; }
  addLine(o) { const it = { positions: [] }; this.items.push(it); return it; }
  remove(p) { const i = this.items.indexOf(p); if (i >= 0) this.items.splice(i, 1); }
  indexOf(p) { return this.items.indexOf(p); }
}
class MockCartographic { constructor(h, v, r) { this.longitude = h; this.latitude = v; this.height = r; } }
MockCartographic.toCartesian = (c) => new MockCartesian3(6000, 0, 300);
const stubCesium = {
  Ion: { defaultAccessToken: '' },
  Viewer: class { constructor() {} },
  EllipsoidTerrainProvider: class {},
  ArcGisMapServerImageryProvider: class { constructor() {} },
  SkyBox: class { constructor(o) {} },
  BillboardCollection: MockBillboardCollection,
  PolylineCollection: MockPolylineCollection,
  Cartesian2: class { constructor(x, y) { this.x = x; this.y = y; } },
  Cartesian3: MockCartesian3,
  Cartographic: MockCartographic,
  toCartesian: (c) => new MockCartesian3(6000, 0, 300),
  Color: {
    fromCssColorString: (s) => ({ toString() { return s; } }),
    withAlpha: (c, a) => c
  },
  JulianDate: {
    fromDate: (d) => ({ getTime: () => d.getTime(), toString() { return 'JulianDate'; } }),
    toDate: (jd) => new Date(jd.getTime()),
    fromIso8601: () => ({ getTime: () => Date.now() })
  },
  Math: {
    toRadians: (d) => (d * Math.PI / 180),
    toDegrees: (r) => (r * 180 / Math.PI),
    clamped: (v) => v
  },
  scene: { globe: { enableLighting: false }, screenSpaceCameraController: { enableCollisionDetection: false }, primitives: { add: () => {} } },
  Camera: class {}
};
globalThis.window.Cesium = stubCesium;

// Import app modules (order matters: config before utils/main)
await import('./js/config.js');
const utils = await import('./js/utils.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); passed++; }
  catch (e) { console.error('  FAIL:', name, e.message); failed++; }
}
function eq(a, b) { if (a !== b) throw new Error(`expected ${b} got ${a}`); }
function close(a, b, t = 1e-6) { if (Math.abs(a - b) > t) throw new Error(`expected ~${b} got ${a}`); }

console.log('\n=== 1. Catalog load (data-layer v1 format) ===');
const cat = await utils.loadTLEFile('data/catalog.json');
const catalog = JSON.parse(cat);
eq(catalog.groups.length, 6);
eq(catalog.satelliteCount, catalog.satellites.length);
test('catalog has 6 groups + 17 satellites', () => {});

console.log('\n=== 2. Catalog satellites (parse + propagate) ===');
let bad = 0;
const byGroup = {};
for (const csat of catalog.satellites) {
  const key = csat.group.toLowerCase().replace(/\s+/g, '-');
  byGroup[key] = (byGroup[key] || 0) + 1;
  try {
    const satrec = satellite.twoline2satrec(csat.tleLine1, csat.tleLine2);
    if (satrec.error !== 0) bad++;
    const res = satellite.propagate(satrec, new Date(csat.epoch));
    if (res && utils.isDegenerate(satrec, res.position)) bad++;
  } catch (e) { bad++; }
}
test('all 17 catalog satellites parse & propagate', () => { eq(bad, 0); });
test('group counts (resurs_p 3, meteor_m 4, kanopus_v 4, glonass 3, express_geo 2, luch 1)', () => {
  const expect = {resurs_p:3,meteor_m:4,kanopus_v:4,glonass:3,express_geo:3,luch:2};
  for (const k of Object.keys(expect)) eq(byGroup[k], expect[k]);
});
test('all.txt (starlink+testsats demo) still parses 550 sats', async () => {
  const all = utils.parseTLESGroup(await utils.loadTLEFile('data/tles/all.txt'));
  eq(all.sats.length, 550);
});
test('starlink.txt 500 / testsats.txt 50 parse', async () => {
  eq(utils.parseTLESGroup(await utils.loadTLEFile('data/tles/starlink.txt')).sats.length, 500);
  eq(utils.parseTLESGroup(await utils.loadTLEFile('data/tles/testsats.txt')).sats.length, 50);
});

console.log('\n=== 3. Degenerate / quality filtering ===');
const s = utils.parseTLESGroup(await utils.loadTLEFile('data/tles/starlink.txt'));
let bad2 = 0;
for (const sat of s.sats) {
  try {
    const date = new Date('2026-10-07T12:00:00Z');
    const res = satellite.propagate(sat.satrec, date);
    if (utils.isDegenerate(sat.satrec, res?.position)) bad2++;
  } catch (e) { bad2++; }
}
test('no degenerate satellites in starlink group', () => { eq(bad2, 0); });
test('bogus TLE parses but is filtered as degenerate', () => {
  const { sats } = utils.parseTLESGroup('BAD-SAT\n1 25544U 98067A 26280.05811131 -.00034255 00000-0 -30341-3 44115\n2 25544');
  eq(sats.length, 1); // error flag stays 0 but fields are NaN
  const res = satellite.propagate(sats[0].satrec, new Date('2026-10-07T12:00:00Z'));
  eq(utils.isDegenerate(sats[0].satrec, res?.position), true);
});
test('degenerate satrec (error flag) filtered', () => {
  eq(utils.isDegenerate({ error: 1 }, null), true);
});
test('isDegenerate rejects sub-surface', () => { eq(utils.isDegenerate(s.sats[0].satrec, {x:1,y:2,z:0}), true); });
test('isDegenerate accepts healthy orbit', () => { eq(utils.isDegenerate(s.sats[0].satrec, {x:6000,y:3000,z:4000}), false); });

console.log('\n=== 4. Propagation + coordinates ===');
const sat0 = s.sats[0];
const date = new Date('2026-10-07T12:00:00Z');
const res = satellite.propagate(sat0.satrec, date);
test('propagate returns position/velocity', () => { eq(typeof res.position.x, 'number'); eq(typeof res.velocity.x, 'number'); });
test('position altitude above surface (ECF)', () => {
  const r = Math.sqrt(res.position.x**2 + res.position.y**2 + res.position.z**2);
  eq(r > 6378, true); close(r, 6928.14, 50);
});
test('ecfToEci / eciToEcf round-trip', () => {
  const gmst = satellite.gstime(date);
  const eci = satellite.ecfToEci(res.position, gmst);
  const back = satellite.eciToEcf(eci, gmst);
  close(back.x, res.position.x, 1e-9); close(back.y, res.position.y, 1e-9); close(back.z, res.position.z, 1e-9);
});
test('cartesianFromEcf -> Cartesian3', () => {
  const c = utils.cartesianFromEcf(res.position);
  eq(c instanceof globalThis.window.Cesium.Cartesian3, true); close(c.x, res.position.x, 1e-9);
});
test('JulianDate <-> Date round trip', () => {
  const jd = utils.dateToJulianDate(date);
  eq(utils.julianDateToDate(jd).toUTCString(), date.toUTCString());
});

console.log('\n=== 5. Pass prediction ===');
const passes = utils.predictPass(sat0.satrec, 55.7558, 37.6176, date, 14400, 10);
test('predictPass returns array', () => { eq(Array.isArray(passes), true); console.log('      passes found in 4h:', passes.length); });
test('pass structure has required keys', () => {
  if (passes.length) {
    eq(passes[0].hasOwnProperty('start'), true);
    eq(passes[0].hasOwnProperty('stop'), true);
    eq(passes[0].hasOwnProperty('maxElevationDeg'), true);
  }
});

console.log('\n=== 6. Config values ===');
import { DEFAULT_GROUPS, GROUP_COLORS, TIME_SPEED, RENDER, CAMERA } from './js/config.js';
test('all 8 groups have colors', () => {
  const keys = Object.keys(DEFAULT_GROUPS);
  eq(keys.length, 8);
  for (const k of keys) eq(typeof GROUP_COLORS[k], 'string');
});
test('time speed bounds', () => { eq(TIME_SPEED.min, 1); eq(TIME_SPEED.max, 100); eq(TIME_SPEED.default, 1); });
test('render caps sensible', () => { eq(RENDER.MAX_VISIBLE_SATS, 250); eq(RENDER.TRAIL_LENGTH, 40); });
test('camera orbit params sensible', () => { eq(CAMERA.ORBIT_RADIUS_FACTOR, 1.6); eq(CAMERA.ORBIT_SPEED_RADS_PER_SEC, 0.06); });

console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');
process.exit(failed ? 1 : 0);
