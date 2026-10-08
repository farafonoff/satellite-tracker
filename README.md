# RASSVET — Russian Satellite Tracker

A dark-themed, single-page, browser-based Earth-orbit tracker for Russian (and demo) satellites, built on **Cesium 1.119.0 (UMD)** and **satellite.js v3.0.1** (SGP4 propagation). No build step — drop it on any HTTP server and open it.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Single-page dark-themed viewer |
| `js/config.js` | CDN URLs, group definitions, group colors, time-speed & render limits |
| `js/utils.js` | TLE parsing, JulianDate/Date helpers, ECF↔ECI, pass prediction |
| `js/main.js` | Cesium viewer init, catalog loader, update loop, camera, UI |
| `js/satellite.mjs` | satellite.js v3.0.1 copy (local CDN-fallback) |
| `data/catalog.json` | Group→TLE file mapping (Resurs-P, Meteor-M, Kanopus-V, Express-Geo, GLONASS, plus demo Starlink/Test Sats) |
| `data/tles/*.txt` | TLE files (header: `@ GROUP=<name>`, or auto-discovered) |

## How to run locally

1. Start a simple HTTP server in the workspace root:

   ```bash
   cd /Users/artem_farafonov/Projects/satelliteTracker
   python3 -m http.server 8000
   ```

2. Open in a browser: **http://localhost:8000**

   The page loads Cesium from a CDN; satellite.js is served locally. An HTTP server is required because ES modules cannot be loaded via `file://`.

   *Optional:* for a Node-based test harness, `js/utils.js`'s `loadTLEFile()` falls back to `fs.readFileSync` when no `fetch` exists.

## Catalog & TLE data format

The data layer provides `data/catalog.json` (v1): an array of `groups` and an array of `satellites`; each satellite carries `tleLine1` and `tleLine2`, `noradId`, `commonName`, and its `group` name. The viewer parses every TLE line pair with `twoline2satrec`, normalizes group names (e.g., `resurs_p` -> `resurs-p`), and maps them to the RASSVET theme groups.

For raw TLE collections (older catalogs or `data/tles/*.txt` files), one satellite per `NAME` followed by its 68/69-char TLE triplet; tag a file with a single `@ GROUP=<name>` header line to assign its group. The loader also auto-discovers any `.txt` in `data/tles/` if `catalog.json` is missing.

## Adding your own TLE data

Create a text file in `data/tles/` (one satellite per name/TLE-triplet, 68/69-char TLE lines):

```
COSMOS-2558
1 48273U 23088A   26280.12345678 +.00001234 00000-0  +00000-0 00000-0 00000
2 48273 64.8333 123.4567 0001234 234.5678 123.4567 14.12345678123456
```

Tag it with a group header so it appears in the Group filters panel:

```
@ GROUP=resurs-p
1 48273U 23088A   ...
2 48273 64.8333 123.4567 ...
```

Then add the group+file entry to `data/catalog.json`. The viewer will auto-load, auto-cap at 250 visible satellites, and draw group-colored markers + trails.

## What Cesium primitives are used (and why)

- **`Cesium.Viewer`** with `EllipsoidTerrainProvider()` and `ArcGisMapServerImageryProvider` — fully Ion-free (no API token).
- **`Cesium.BillboardCollection`** for per-satellite markers — billboards are GPU-batched and the most efficient per-entity primitive for 200–400 items; an SVG data-URI pin marks each satellite.
- **`Cesium.PolylineCollection`** for trails — one polyline per visible satellite holding the last `TRAIL_LENGTH` (40) propagated positions; the collection is batched into a single primitive, keeping draw calls to a minimum.
- **`Cesium.Entity` is NOT used** — with 19 catalog satellites the Entity API would be far too heavy; billboards/polylines cap rendering at `MAX_VISIBLE_SATS` (250) cleanly.
- **Camera:** manual auto-orbit via `viewer.scene.camera.position/heading/pitch` (slow, smooth Earth rotation).
- **Time:** Cesium `Clock` (`shouldAnimate` + `multiplier`) drives the simulation at 1–100x realtime; each frame propagates every visible satellite once with `satellite.propagate` and updates marker + trail positions.

## satellite.js v3 gotchas encountered

- **`twoline2satrec(longstr1, longstr2)`** takes the two TLE lines as **separate string arguments** (not a newline-separated string).
- **`propagate(satrec, date)`** takes a **JavaScript `Date` object** (v2 used minutes since epoch). It returns `{ position: {x,y,z}, velocity: {...}, error }`.
- **ECEF vs ECI confusion:** sgp4/`propagate` return **ECF (Earth-Centered Fixed, ITRS)** — Cesium's ECI is ITRF-based with identical axis conventions, so ECF positions are passed to Cesium `Cartesian3` **directly with no rotation**. `satellite.ecfToEci` / `eciToEcf` in v3 only apply a GMST rotation (no nutation/polar-motion correction), so they must NOT be used for positioning.
- **`ecfToLookAngles(observerGeodetic, satelliteEcf)`** (2-arg form) computes elevation/azimuth in the ECF frame directly — used for the pass predictor.
- jsdelivr has no publish path for satellite.js 3.0.1, so the build is vendored locally in `js/satellite.mjs` (a fallback path is still recorded in `CDN_URLS`).

## Known limitations

- `EllipsoidTerrainProvider` — Ion-free terrain substitute (flat ellipsoid; true world terrain needs an Ion token).
- Auto-cap at 250 visible satellites; larger catalogs are sampled with smaller groups prioritized.
- Degenerate satellites (parse errors, sub-surface positions) are skipped with a `console.warn`.
