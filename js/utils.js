// js/utils.js - helper utilities for the RASSVET viewer
//
// Coordinate note (satellite.js v3 gotcha):
//   propagate() returns ECF (Earth-Centered Fixed / ITRS) position vectors in km.
//   ECF = ITRS, so the sub-satellite point is simply lat/lon at that instant —
//   no GMST rotation is needed for rendering to a flat map.
//   For pass prediction you may need eciToEcf() / ecfToEci() to rotate between
//   ECI and ECF using the GMST.

// window.satellite is loaded via index.html; resolve at runtime.
import { radiansToDegrees } from './satellite.mjs';

/** JulianDate <-> Date conversions (kept for reference; unused by the Leaflet view). */
export function dateToJulianDate(date) {
  return Cesium.JulianDate.fromDate(date);
}

export function julianDateToDate(jd) {
  return Cesium.JulianDate.toDate(jd);
}

/** ECF position {x,y,z} in km (satellite.js) -> Cesium Cartesian3 (still km).
 * Note: Cesium expects METERS, so multiply by 1000 before passing to Cesium. */
export function cartesianFromEcf(ecf) {
  return new Cesium.Cartesian3(ecf.x, ecf.y, ecf.z);
}

/**
 * Convert an ECI position to ECF using the GMST at the given date.
 * (Kept for reference / pass prediction.)
 */
export function eciToEcf(eci, date) {
  const gmst = satellite.gstime(date);
  return satellite.eciToEcf(eci, gmst);
}

/**
 * Convert an ECF position to ECI using the GMST at the given date.
 * (Reference only; do NOT feed Cesium with this — it would un-rotate the sat.)
 */
export function ecfToEci(ecf, date) {
  const gmst = satellite.gstime(date);
  return satellite.ecfToEci(ecf, gmst);
}

/**
 * Parse TLE triplets from a TLE file text.
 * Recognizes a single leading '@ GROUP=<name>' header line. Lines not
 * starting with a digit are treated as satellite names for the following
 * two TLE lines. Blank lines and group headers are ignored (except the first
 * @ GROUP= which sets the group name for the whole file).
 * Degenerate / unparseable entries are skipped with console.warn.
 * @returns {{ groupName: string, sats: Array<{name: string, satrec: object}> }}
 */
export function parseTLESGroup(text) {
  const groupName = text.match(/^@ GROUP=(\S+)/m)?.[1] || 'Unsorted';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const sats = [];
  let name = null;
  let pending = [];

  for (const line of lines) {
    if (/^\d/.test(line)) {
      pending.push(line);
      if (pending.length === 2) {
        try {
          const satrec = satellite.twoline2satrec(pending[0], pending[1]);
          if (satrec.error === 0) {
            sats.push({ name: name || pending[0], satrec });
          } else {
            console.warn('parseTLESGroup: TLE parse error for', name || '?');
          }
        } catch (e) {
          console.warn('parseTLESGroup: failed to parse TLE for', name || '?', e.message);
        }
        pending = [];
        name = null;
      }
    } else {
      name = line;
    }
  }
  return { groupName, sats };
}

/**
 * Check whether a propagated satellite is degenerate/unusable for rendering.
 */
export function isDegenerate(satrec, position) {
  if (satrec?.error) return true;
  if (!position || Number.isNaN(position.x) || Number.isNaN(position.y) || Number.isNaN(position.z)) return true;
  const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
  if (r < 6350) return true; // below Earth surface
  return false;
}

/**
 * Predict the next visible pass(es) of a satellite over a ground observer.
 * Fast discrete search in the ECF frame using satellite.js ecfToLookAngles.
 * @param {object} satrec  satellite.js satrec object
 * @param {number} latDeg  observer latitude
 * @param {number} lonDeg  observer longitude
 * @param {Date} fromDate  search start
 * @param {number} durationSeconds  search window
 * @param {number} minElevDeg  minimum elevation to consider a pass (default 10)
 * @returns {Array<{start: Date, stop: Date, maxElevationDeg: number, maxElevationTime: Date}>}
 */
export function predictPass(satrec, latDeg, lonDeg, fromDate, durationSeconds, minElevDeg) {
  const minElev = satellite.degreesToRadians(minElevDeg ?? 10);
  const obs = {
    longitude: satellite.degreesToRadians(lonDeg),
    latitude: satellite.degreesToRadians(latDeg),
    height: 0
  };
  const obsEcf = satellite.geodeticToEcf(obs);

  const results = [];
  let open = false;
  let maxElev = 0;
  const step = 1.0; // seconds

  for (let t = 0; t <= durationSeconds; t += step) {
    const simDate = new Date(fromDate.getTime() + t * 1000);
    const res = satellite.propagate(satrec, simDate);
    const look = satellite.ecfToLookAngles(obsEcf, res.position, obs.longitude, obs.latitude, obs.height, 0);
    if (look.elevation > minElev && !open) {
      open = true;
      maxElev = look.elevation;
      results.push({ start: simDate });
    } else if (open) {
      open = false;
      const last = results[results.length - 1];
      last.stop = simDate;
      last.maxElevationDeg = satellite.radiansToDegrees(maxElev);
      // rough max time estimate = midpoint of pass
      last.maxElevationTime = new Date(
        last.start.getTime() + ((last.stop.getTime() - last.start.getTime()) / 2)
      );
    }
  }
  // open pass at end of window
  if (open && results.length) {
    results[results.length - 1].stop = new Date(fromDate.getTime() + durationSeconds * 1000);
  }
  return results;
}

/**
 * Load a TLE file: browser uses fetch; Node runtime falls back to fs.readFileSync.
 */
export async function loadTLEFile(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error('loadTLEFile: ' + r.status + ' ' + path);
    return r.text();
  } catch (e) {
    // fetch failed (no server / Node relative URL) -> fall back to fs.readFileSync
    const fs = await import('fs');
    return fs.readFileSync(path, 'utf8');
  }
}

/**
 * Convert a satellite.js ECF (ITRS) position vector (km) to [lat, lon] in
 * degrees. satellite.js v3 has no direct ECF->geodetic converter; we go ECF ->
 * ECI -> geodetic. eciToGeodetic returns radians, so we convert to degrees.
 * @param {{x:number,y:number,z:number}} ecfPosition  ECF vector in km
 * @param {Date} date  propagation date (for GMST)
 * @returns {[number,number]}  [latitude, longitude] in degrees
 */
export function posEcfToLatLng(ecfPosition, date) {
  const gmst = satellite.gstime(date);
  const eci = satellite.ecfToEci(ecfPosition, gmst);
  const geo = satellite.eciToGeodetic(eci, gmst);
  return [radiansToDegrees(geo.latitude), radiansToDegrees(geo.longitude)];
}

/**
 * Create a Leaflet divIcon marker for a satellite: a colored, softly-glowing
 * halo built with a CSS radial-gradient (no inline SVG, so the color always
 * renders regardless of browser/SVG gradient quirks).
 * @param {string} color  hex color for the halo (e.g. from GROUP_COLORS)
 * @returns {L.DivIcon}
 */
export function createSatIcon(color) {
  const size = 28;
  const half = size / 2;
  const html =
    '<div style="width:' + size + 'px;height:' + size + 'px;' +
    'background:radial-gradient(circle,' + color + ' 0%,rgba(0,0,0,0) 70%);' +
    'border-radius:50%;' +
    'box-shadow:0 0 10px ' + color + ';cursor:pointer;" ' +
    'title=""></div>';
  console.log('RASSVET ICON:', color, 'size=' + size);
  return L.divIcon({
    className: 'satellite-marker',
    html: html,
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -16]
  });
}

/**
 * Downsample an array of [lat,lng] points to at most maxPoints while keeping
 * evenly spaced points and the endpoints. Preserves the wave shape of ground
 * tracks.
 */
export function downsampleLatLngs(points, maxPoints) {
  if (!points || points.length <= maxPoints) return points.slice();
  const stride = Math.max(1, Math.floor((points.length - 1) / (maxPoints - 1)));
  const out = [];
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[i]);
  }
  const last = points[points.length - 1];
  if (!out.length || out[out.length - 1] !== last) {
    out.push(last);
  }
  return out;
}
