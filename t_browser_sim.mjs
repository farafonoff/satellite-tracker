#!/usr/bin/env node
// t_browser_sim.mjs - simulate browser script order: satellite.js, Cesium, then app modules
import * as satellite from './node_modules/satellite.mjs';

// ---- minimal DOM mock ----
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.innerHTML = ''; this.textContent = ''; this.id = ''; this.dataset = {}; this.querySelector = (sel) => { if (sel === 'span') return new Element('span'); return null; }; this.querySelectorAll = (sel) => []; this.addEventListener = () => {}; this.onclick = null; }
  appendChild(c) { this.children.push(c); return c; }
}
class Document {
  constructor() { this.body = new Element('body'); this.createElement = (tag) => new Element(tag); this.getElementById = (id) => new Element('div'); }
}
globalThis.document = new Document();
globalThis.window = { document, satellite };
let _frames = 0; globalThis.requestAnimationFrame = (cb) => { _frames++; setTimeout(cb, 16); if (_frames > 40) process.exit(0); };

// ---- Cesium stub (same as t_viewer) ----
class MockCartesian3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
MockCartesian3.fromElements = MockCartesian3;
MockCartesian3.fromDegrees = () => new MockCartesian3(0, 0, 0);
class MockBillboardCollection { constructor() { this.items = []; }
  add(b) { const it = { ...b }; this.items.push(it); return it; }
  remove(b) { const i = this.items.indexOf(b); if (i >= 0) this.items.splice(i, 1); }
  indexOf(b) { return this.items.indexOf(b); } get length() { return this.items.length; } }
class MockPolylineCollection { constructor() { this.items = []; }
  addLine(o) { const it = { positions: [] }; this.items.push(it); return it; }
  remove(p) { const i = this.items.indexOf(p); if (i >= 0) this.items.splice(i, 1); }
  indexOf(p) { return this.items.indexOf(p); } }
class MockCartographic { constructor(h, v, r) { this.longitude = h; this.latitude = v; this.height = r; } }
MockCartographic.toCartesian = (c) => new MockCartesian3(10205019, 0, 1753706);
globalThis.window.Cesium = {
  Ion: { defaultAccessToken: '' },
  Viewer: class {
    constructor() {
      this.clock = {
        startTime: null,
        currentTime: null,
        multiplier: 1,
        shouldAnimate: false,
        tick: () => {}
      };
      this.scene = {
        globe: { enableLighting: false },
        screenSpaceCameraController: { enableCollisionDetection: false },
        primitives: { add: () => {} },
        camera: {
          position: null, heading: 0, pitch: 0, roll: 0,
          moveEnd: () => {},
          getPosition: () => new MockCartesian3(0, 0, 0)
        }
      };
    }
  },
  EllipsoidTerrainProvider: class {},
  ArcGisMapServerImageryProvider: class { constructor() {} },
  SkyBox: class { constructor(o) {} },
  BillboardCollection: MockBillboardCollection,
  PolylineCollection: MockPolylineCollection,
  Cartesian2: class { constructor(x, y) { this.x = x; this.y = y; } },
  Cartesian3: MockCartesian3,
  Cartographic: MockCartographic,
  toCartesian: (c) => new MockCartesian3(6000, 0, 300),
  Ellipsoid: { WGS84: { maximumRadius: 6378137 } },
  Color: { fromCssColorString: (s) => { const c = { toString() { return s; } }; c.withAlpha = (a) => c; return c; }, withAlpha: (c, a) => c },
  JulianDate: {
    fromDate: (d) => ({ getTime: () => d.getTime(), toString() { return 'JulianDate'; } }),
    toDate: (jd) => new Date(jd.getTime()),
    fromIso8601: () => ({ getTime: () => Date.now() })
  },
  Math: { toRadians: (d) => (d * Math.PI / 180), toDegrees: (r) => (r * 180 / Math.PI), clamped: (v) => v },
  scene: { globe: { enableLighting: false }, screenSpaceCameraController: { enableCollisionDetection: false }, primitives: { add: () => {} } },
  Camera: class {}
};

// ---- load app modules in order ----
await import('./js/config.js');
await import('./js/utils.js');

console.log('config.js + utils.js loaded OK (Cesium + satellite.js globals present)');

// ---- load main.js (runs viewer.init() eagerly) ----
try {
  await import('./js/main.js');
  console.log('main.js loaded + viewer.init() completed OK');
  console.log('groups loaded:', Object.keys(globalThis.viewer.groupInfo).join(', '));
  const total = Object.values(globalThis.viewer.groupInfo).reduce((a, g) => a + (g.loadedCount || 0), 0);
  console.log('total satellites:', total);
} catch (e) {
  console.error('FAIL:', e.stack);
  process.exit(1);
}
