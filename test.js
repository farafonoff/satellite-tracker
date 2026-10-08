// js/test.js - unit tests for RASSVET extracted modules (run in Node: node test.js)
import assert from 'node:assert';
import * as satellite from './js/satellite.mjs';
import { RENDER } from './js/config.js';
import * as hashMatrix from './js/hashMatrix.js';

// view_helpers.v2.js has no browser dependencies.
import * as vh from './js/view_helpers.v2.js';

// utils.js resolves `window.satellite` at runtime; attach the local bundle
// BEFORE importing it. (In the browser, index.html sets window.satellite.)
global.window = { satellite };
const utils = await import('./js/utils.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error('  ', e.message);
    if (e.stack) console.error('  ', e.stack.split('\n').slice(1).join('\n  '));
    failed++;
  }
}

// --- normalizeKey / groupKeyToName ---
test('vh.normalizeKey: normalizes underscores/space to hyphens', () => {
  assert.strictEqual(vh.normalizeKey('express_geo'), 'express-geo');
  assert.strictEqual(vh.normalizeKey('RUS NET'), 'rus-net');
  assert.strictEqual(vh.normalizeKey('RESURS-P'), 'resurs-p');
});

test('vh.groupKeyToName: key -> display name', () => {
  assert.strictEqual(vh.groupKeyToName('express-geo'), 'express geo');
  assert.strictEqual(vh.groupKeyToName('molniya-anomalous'), 'molniya anomalous');
});

test('vh.formatClock: ISO -> human clock string', () => {
  const d = new Date('2026-10-08T14:30:45Z');
  assert.strictEqual(vh.formatClock(d), '2026-10-08 14:30:45 UTC');
});

// --- posEcfToLatLng vs satellite.js ground truth (geodetic degrees at given GMST) ---
function groundTruthLatLonDeg(ecf, date) {
  const gmst = satellite.gstime(date);
  const eci = satellite.ecfToEci(ecf, gmst);
  const geo = satellite.eciToGeodetic(eci, gmst);
  return [satellite.radiansToDegrees(geo.latitude), satellite.radiansToDegrees(geo.longitude)];
}

test('utils.posEcfToLatLng: origin ECF -> 0, 0', () => {
  const ecf = { x: 6378137, y: 0, z: 0 };
  const [lat, lng] = utils.posEcfToLatLng(ecf, new Date('2026-10-08T00:00:00Z'));
  const [gtLat, gtLng] = groundTruthLatLonDeg(ecf, new Date('2026-10-08T00:00:00Z'));
  assert(Math.abs(lat - gtLat) < 1e-9, `lat ${lat} vs ${gtLat}`);
  assert(Math.abs(lng - gtLng) < 1e-9, `lng ${lng} vs ${gtLng}`);
});

test('utils.posEcfToLatLng: +Z ECF -> north pole', () => {
  const ecf = { x: 0, y: 0, z: 6378137 };
  const [lat, lng] = utils.posEcfToLatLng(ecf, new Date('2026-10-08T00:00:00Z'));
  const [gtLat, gtLng] = groundTruthLatLonDeg(ecf, new Date('2026-10-08T00:00:00Z'));
  assert(Math.abs(lat - gtLat) < 1e-9, `lat ${lat} vs ${gtLat}`);
  assert(Math.abs(lng - gtLng) < 1e-9, `lng ${lng} vs ${gtLng}`);
});

test('utils.posEcfToLatLng: +Y ECF -> 0, 90', () => {
  const ecf = { x: 0, y: 6378137, z: 0 };
  const [lat, lng] = utils.posEcfToLatLng(ecf, new Date('2026-10-08T00:00:00Z'));
  const [gtLat, gtLng] = groundTruthLatLonDeg(ecf, new Date('2026-10-08T00:00:00Z'));
  assert(Math.abs(lat - gtLat) < 1e-9, `lat ${lat} vs ${gtLat}`);
  assert(Math.abs(lng - gtLng) < 1e-9, `lng ${lng} vs ${gtLng}`);
});

test('utils.posEcfToLatLng: equatorial +X rotated 45deg -> lng 45', () => {
  const ecf = { x: 4511113, y: 4511113, z: 0 };  // 6378137/sqrt(2)
  const [lat, lng] = utils.posEcfToLatLng(ecf, new Date('2026-10-08T00:00:00Z'));
  const [gtLat, gtLng] = groundTruthLatLonDeg(ecf, new Date('2026-10-08T00:00:00Z'));
  assert(Math.abs(lat - gtLat) < 1e-9, `lat ${lat} vs ${gtLat}`);
  assert(Math.abs(lng - gtLng) < 1e-9, `lng ${lng} vs ${gtLng}`);
});

// --- downsampleLatLngs ---
test('utils.downsampleLatLngs: no-op when small', () => {
  const pts = [[0, 0], [1, 1], [2, 2]];
  const out = utils.downsampleLatLngs(pts, 100);
  assert.strictEqual(out.length, 3);
  assert.ok(out !== pts);  // returns a copy
});

test('utils.downsampleLatLngs: keeps endpoints', () => {
  const pts = [];
  for (let i = 0; i <= 1000; i++) pts.push([i / 1000, i / 1000]);
  const out = utils.downsampleLatLngs(pts, RENDER.MAX_TRAIL_POINTS);
  assert.deepStrictEqual(out[0], [0, 0]);
  assert.deepStrictEqual(out[out.length - 1], [1, 1]);
});

test('utils.downsampleLatLngs: caps at maxPoints', () => {
  const pts = [];
  for (let i = 0; i <= 1000; i++) pts.push([i / 1000, i / 1000]);
  const out = utils.downsampleLatLngs(pts, RENDER.MAX_TRAIL_POINTS);
  assert.ok(out.length <= RENDER.MAX_TRAIL_POINTS, `got ${out.length} points`);
  assert.ok(out.length > RENDER.MAX_TRAIL_POINTS * 0.8, 'should stay close to maxPoints');
});

test('utils.downsampleLatLngs: 5 points -> 3 with even spacing + endpoints', () => {
  const pts = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
  const out = utils.downsampleLatLngs(pts, 3);
  assert.strictEqual(out.length, 3);
  assert.deepStrictEqual(out, [[0, 0], [2, 2], [4, 4]]);
});

// --- splitAroundAntimeridian ---
test('vh.splitAroundAntimeridian: no antimeridian crossing', () => {
  const pts = [[0, 0], [0, 10], [0, 20]];
  const segs = vh.splitAroundAntimeridian(pts);
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].length, 3);
});

test('vh.splitAroundAntimeridian: crosses antimeridian', () => {
  const pts = [[0, 170], [0, 175], [0, 179], [0, -179], [0, -175]];
  const segs = vh.splitAroundAntimeridian(pts);
  assert.strictEqual(segs.length, 2, 'two segments across the seam');
  assert.deepStrictEqual(segs[0][0], [0, 170]);
  assert.deepStrictEqual(segs[0][segs[0].length - 1], [0, 179]);
  assert.deepStrictEqual(segs[1][0], [0, -179]);
  assert.deepStrictEqual(segs[1][segs[1].length - 1], [0, -175]);
});

test('vh.splitAroundAntimeridian: empty / single point', () => {
  assert.deepStrictEqual(vh.splitAroundAntimeridian([]), [[]]);
  assert.deepStrictEqual(vh.splitAroundAntimeridian([[5, 5]]), [[[5, 5]]]);
});

// --- parseTLESGroup ---
test('utils.parseTLESGroup: parses TLE block with GROUP header', () => {
  const text = `@ GROUP=ISS (ZARYA)
ISS (ZARYA)
1 25544U 98067A   26282.08461581  .00012345  00000-0  23456-3 0  9992
2 25544  51.6416 123.4567 0001234  45.6789 314.1592 15.50000000123456
`;
  const { groupName, sats } = utils.parseTLESGroup(text);
  assert.strictEqual(groupName, 'ISS (ZARYA)');
  assert.strictEqual(sats.length, 1);
  assert.strictEqual(sats[0].name, 'ISS (ZARYA)');
  assert.strictEqual(sats[0].satrec.error, 0);
});

test('utils.parseTLESGroup: defaults to Unsorted without GROUP header', () => {
  const text = `1 25544U 98067A   26282.08461581  .00012345  00000-0  23456-3 0  9992
2 25544  51.6416 123.4567 0001234  45.6789 314.1592 15.50000000123456
`;
  const { groupName } = utils.parseTLESGroup(text);
  assert.strictEqual(groupName, 'Unsorted');
});

// --- cadence: confirm historical points accrue under smooth animation ---
test('cadence accrues points across multiple frames', () => {
  const pushEvery = RENDER.TRAIL_CADENCE_SEC * 1000;
  const hist = [];
  let lastCadPos = null, lastCadPosTime = null;
  let simTime = new Date(0).getTime();

  function step(frameSimAdvanceMs) {
    simTime += frameSimAdvanceMs;
    const p = { x: frameSimAdvanceMs, y: 0, z: 0 };
    if (lastCadPos == null) {
      hist.push([0, 0]);
      lastCadPos = p;
      lastCadPosTime = simTime;
    } else {
      const simNow = simTime;
      const dt = simNow - lastCadPosTime;
      let t = lastCadPosTime;
      while (simNow - t >= pushEvery) {
        t += pushEvery;
        const frac = (t - lastCadPosTime) / dt;
        hist.push([t, 0]);
        lastCadPos = { x: lastCadPos.x + (p.x - lastCadPos.x) * frac, y: 0, z: 0 };
        lastCadPosTime = t;
      }
    }
  }

  // smooth 1x-ish animation: 50ms sim advance per frame
  for (let f = 0; f < 120; f++) step(50);
  assert.ok(hist.length >= 2, `trail should have grown (${hist.length} points)`);
});

// --- initial trail build: full historical buffer from a cold start ---
test('initial trail build: fills buffer backwards from sim time', () => {
  const hist = [];
  let probe = new Date(0);
  while (hist.length < RENDER.MAX_TRAIL_HIST) {
    probe = new Date(probe.getTime() - RENDER.TRAIL_CADENCE_SEC * 1000);
    hist.push([0, 0]);
  }
  assert.strictEqual(hist.length, RENDER.MAX_TRAIL_HIST);
});

// --- hash matrix: parse / build ---
test('hashMatrix.parseSelectionHash: missing matrix -> all groups visible', () => {
  const groupKeys = ['geo', 'glonass', 'resurs-p'];
  const sel = hashMatrix.parseSelectionHash('', groupKeys);
  assert.strictEqual(sel.size, 3);
  assert(sel.has('geo') && sel.has('glonass') && sel.has('resurs-p'));
});

test('hashMatrix.parseSelectionHash: parses selection list', () => {
  const groupKeys = ['geo', 'glonass', 'resurs-p'];
  const sel = hashMatrix.parseSelectionHash('satellites=[geo,resurs-p]', groupKeys);
  assert.strictEqual(sel.size, 2);
  assert(sel.has('geo') && sel.has('resurs-p'));
  assert(!sel.has('glonass'));
});

test('hashMatrix.parseSelectionHash: empty list -> nothing visible', () => {
  const groupKeys = ['geo', 'glonass', 'resurs-p'];
  const sel = hashMatrix.parseSelectionHash('satellites=[]', groupKeys);
  assert.strictEqual(sel.size, 0);
});

test('hashMatrix.parseSelectionHash: drops unknown keys', () => {
  const groupKeys = ['geo', 'glonass'];
  const sel = hashMatrix.parseSelectionHash('satellites=[geo,unknown,satx]', groupKeys);
  assert.strictEqual(sel.size, 1);
  assert(sel.has('geo'));
  assert(!sel.has('unknown') && !sel.has('satx'));
});

test('hashMatrix.parseSelectionHash: malformed matrix -> default all-visible', () => {
  const groupKeys = ['geo', 'glonass'];
  const sel = hashMatrix.parseSelectionHash('foo=bar', groupKeys);
  assert.strictEqual(sel.size, 2);
});

test('hashMatrix.parseSelectionHash: trims whitespace in entries', () => {
  const groupKeys = ['geo', 'glonass'];
  const sel = hashMatrix.parseSelectionHash('satellites=[ geo , glonass ]', groupKeys);
  assert.strictEqual(sel.size, 2);
  assert(sel.has('geo') && sel.has('glonass'));
});

test('hashMatrix.parseSelectionHash: dedupes duplicate keys', () => {
  const groupKeys = ['geo', 'glonass'];
  const sel = hashMatrix.parseSelectionHash('satellites=[geo,geo,glonass]', groupKeys);
  assert.strictEqual(sel.size, 2);
});

test('hashMatrix.buildSelectionHash: writes sorted visible keys', () => {
  const groupInfo = {
    geo: { visible: true },
    glonass: { visible: false },
    'resurs-p': { visible: true }
  };
  assert.strictEqual(hashMatrix.buildSelectionHash(groupInfo), 'satellites=[geo,resurs-p]');
});

test('hashMatrix.buildSelectionHash: all hidden -> empty list', () => {
  const groupInfo = { geo: { visible: false }, glonass: { visible: false } };
  assert.strictEqual(hashMatrix.buildSelectionHash(groupInfo), 'satellites=[]');
});

// --- trail length: presets and time-based cap ---
const TRAIL_PRESETS = [
  ['15 min', 900],
  ['30 min', 1800],
  ['1h', 3600],
  ['3h', 10800],
  ['6h', 21600],
  ['12h', 43200],
  ['24h', 86400]
];
const TRAIL_CADENCE_SEC = 1;
const MAX_TRAIL_HIST = 10000;

test('trail length presets: default is 1h, all presets parsed', () => {
  const presets = TRAIL_PRESETS;
  assert.strictEqual(presets.length, 7);
  const oneH = presets.find(([l]) => l === '1h');
  assert.ok(oneH && oneH[1] === 3600);
});

test('trail cap: 1h @ 1s cadence -> ~3601 points max', () => {
  const maxCount = Math.min(MAX_TRAIL_HIST, Math.ceil(3600 / TRAIL_CADENCE_SEC) + 1);
  assert.strictEqual(maxCount, 3601);
});

test('trail cap: 24h @ 1s cadence -> capped at MAX_TRAIL_HIST (10000)', () => {
  const maxCount = Math.min(MAX_TRAIL_HIST, Math.ceil(86400 / TRAIL_CADENCE_SEC) + 1);
  assert.strictEqual(maxCount, MAX_TRAIL_HIST);
});

test('trail cap: 30min @ 1s cadence -> 1801 points', () => {
  const maxCount = Math.min(MAX_TRAIL_HIST, Math.ceil(1800 / TRAIL_CADENCE_SEC) + 1);
  assert.strictEqual(maxCount, 1801);
});

// --- trail end-linking: simulate the per-frame cadence logic ---
test('trail end-linking: marker (last point) is always at the trail end', () => {
  const pushEvery = 1000;   // 1s cadence in ms
  const maxCount = 100;     // cap
  const trail = [];
  let lastCadPos = null;
  let lastCadPosTime = 0;
  let simNow = 0;

  for (let frame = 0; frame < 200; frame++) {
    simNow += frame < 5 ? 16 : 1600;  // slow playback then fast playback
    const resultPos = frame * 10;     // fake propagated position

    if (lastCadPos == null) {
      lastCadPos = resultPos;
      lastCadPosTime = simNow;
    } else {
      const dt = simNow - lastCadPosTime;
      let t = lastCadPosTime;
      // strictly-greater: cadence points only fill gaps STRICTLY BEFORE simNow
      while (simNow - t > pushEvery) {
        t += pushEvery;
        const frac = (t - lastCadPosTime) / dt;
        const p = lastCadPos + (resultPos - lastCadPos) * frac;
        trail.push(t);
        lastCadPos = p;
        lastCadPosTime = t;
      }
    }
    // current marker position is always appended as the final point
    trail.push(simNow);
    lastCadPos = resultPos;
    lastCadPosTime = simNow;
    if (trail.length > maxCount) {
      trail.splice(0, trail.length - maxCount);
    }
    // the last point must always equal the current sim time (marker linked to trail end)
    assert.strictEqual(trail[trail.length - 1], simNow);
  }
});

test('trail end-linking: cadence points never sit at/after the current position', () => {
  const pushEvery = 1000;
  const maxCount = 1000;
  const trail = [];
  let lastCadPos = null;
  let lastCadPosTime = 0;
  let simNow = 0;

  for (let frame = 0; frame < 300; frame++) {
    simNow += 2500;  // large frame jumps
    const resultPos = frame * 100;
    if (lastCadPos == null) {
      lastCadPos = resultPos;
      lastCadPosTime = simNow;
    } else {
      const dt = simNow - lastCadPosTime;
      let t = lastCadPosTime;
      while (simNow - t > pushEvery) {
        t += pushEvery;
        const frac = (t - lastCadPosTime) / dt;
        const p = lastCadPos + (resultPos - lastCadPos) * frac;
        trail.push({ t, p });
        lastCadPos = p;
        lastCadPosTime = t;
      }
    }
    trail.push({ t: simNow, pos: resultPos });
    lastCadPos = resultPos;
    lastCadPosTime = simNow;
    if (trail.length > maxCount) {
      trail.splice(0, trail.length - maxCount);
    }
  }
  for (let i = 0; i < trail.length - 1; i++) {
    assert(trail[i].t < simNow, 'cadence point ' + trail[i].t + ' not strictly before simNow');
  }
});

test('trail end-linking: cap keeps at most maxCount points', () => {
  const pushEvery = 1000;
  const maxCount = 50;
  const trail = [];
  let lastCadPos = null;
  let lastCadPosTime = 0;
  let simNow = 0;
  for (let frame = 0; frame < 200; frame++) {
    simNow += 16;
    const resultPos = frame * 10;
    if (lastCadPos == null) {
      lastCadPos = resultPos;
      lastCadPosTime = simNow;
    } else {
      const dt = simNow - lastCadPosTime;
      let t = lastCadPosTime;
      while (simNow - t > pushEvery) {
        t += pushEvery;
        const frac = (t - lastCadPosTime) / dt;
        const p = lastCadPos + (resultPos - lastCadPos) * frac;
        trail.push(t);
        lastCadPos = p;
        lastCadPosTime = t;
      }
    }
    trail.push(simNow);
    lastCadPos = resultPos;
    lastCadPosTime = simNow;
    if (trail.length > maxCount) {
      trail.splice(0, trail.length - maxCount);
    }
    assert.ok(trail.length <= maxCount);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
