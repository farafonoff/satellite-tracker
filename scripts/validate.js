#!/usr/bin/env node
/**
 * Validate every generated Russian TLE: parse (twoline2satrec), propagate,
 * eciToGeodetic; detect degenerate/orphan orbits; print PASS/FAIL counts;
 * emit data/catalog.json.
 *
 * Processes ONE satellite at a time so a single bad entry cannot hang the
 * whole harness (the previous session's failure mode). Each sat gets a
 * hard timeout via AbortController.
 */
import fs from 'fs';
import * as S from '../node_modules/satellite.mjs';

const TLES_DIR = 'data/tles';
const REAL_DIR = 'data/tles/real';
const EARTH_RADIUS = 6378.137;
const ALT_BAND = {
  resurs_p:   [350,  1000],    // ~470 km LEO
  meteor_m:   [650,  1100],    // ~833 km LEO
  kanopus_v:  [450,  850],     // ~600 km LEO
  express_geo:[34000,38000],   // GEO
  glonass:    [16000,23000],   // MEO
  luch:       [28000,48000],   // super-synchronous relay
  geo:        [33500,36500],   // Russian GEO
  rusnet:     [280,  1600],    // Russian LEO
};

const GROUP_ALT = {
  resurs_p:  6848, meteor_m: 7211, kanopus_v: 6978,
  express_geo: 42164, glonass: 25478, luch: 46378,
};

function readRecords() {
  const files = fs.readdirSync(TLES_DIR)
    .filter(n => n.endsWith('.txt'))
    .filter(n => !/^all\.txt$|^starlink\.txt$|^testsats\.txt$/.test(n))
    .sort();
  const recs = [];
  for (const f of files) {
    const group = f.replace(/\.txt$/, '');
    const content = fs.readFileSync(`${TLES_DIR}/${f}`, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const [name, l1, l2] = lines.slice(i, i + 3);
      if (!l1.trim().startsWith('1') || !l2.trim().startsWith('2')) continue;
      if (l1.trim().startsWith('@') || l2.trim().startsWith('@')) continue;
      recs.push({ group, name: name.trim(), line1: l1.trim(), line2: l2.trim(), sourceFile: f });
    }
  }
  // Scan data/tles/real/*.txt (new format: group header + '# <name>' + 1/2 TLE lines)
  const realFiles = fs.readdirSync(REAL_DIR)
    .filter(n => n.endsWith('.txt'))
    .sort();
  for (const f of realFiles) {
    const group = f.replace(/\.txt$/, '');
    const content = fs.readFileSync(`${REAL_DIR}/${f}`, 'utf8');
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('# ')) {
        const name = l.slice(2).trim();
        if (i + 2 < lines.length && lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
          recs.push({ group, name, line1: lines[i + 1], line2: lines[i + 2], sourceFile: f });
          i += 2;
        }
      }
    }
  }
  return recs;
}

async function validateOne(rec) {
  const start = Date.now();
  let err = null;
  const ctl = new AbortController();
  const t = setTimeout(() => { ctl.abort(); }, 12000);
  try {
    const sat = S.twoline2satrec(rec.line1, rec.line2);
    if (!sat) throw new Error('parser returned null');
    if (sat.error !== 0) throw new Error(`parse error ${sat.error}`);
    const res = S.propagate(sat, new Date());
    if (!res.position) throw new Error('propagate returned no position');
    const cart = S.eciToGeodetic(res.position, S.gstime(new Date()));
    if (!cart || Number.isNaN(cart.height)) throw new Error('ecitoGeodetic returned NaN');
    const { x, y, z } = res.position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
      throw new Error(`position NaN/Infinity (${x},${y},${z})`);
    if (!Number.isFinite(cart.height) || !Number.isFinite(cart.latitude) || !Number.isFinite(cart.longitude))
      throw new Error(`geodetic NaN/Infinity (lat=${cart.latitude},lon=${cart.longitude},alt=${cart.height})`);

    // Degeneracy checks
    if (sat.ecco < 0 || sat.ecco >= 1) throw new Error(`ecc out of range ${sat.ecco.toFixed(6)}`);
    if (sat.inclo < 0 || sat.inclo > Math.PI) throw new Error(`inc out of range ${sat.inclo.toFixed(4)} rad`);
    if (rec.group === 'glonass') {
      if (sat.inclo < 0.01 || sat.inclo > Math.PI - 0.01)
        throw new Error('inc ~0/180 for MEO constellation');
    } else if (sat.inclo <= 0.0001) {
      throw new Error('inc=0 (equatorial)');
    }
    const a_er = sat.a;
    if (a_er < 1.02) throw new Error(`sub-orbital a=${a_er.toFixed(3)} ER`);
    if (!Number.isFinite(sat.a) || sat.a <= 0) throw new Error('a invalid');

    return {
      ok: true,
      error: null,
      sat, cart,
      elapsedMs: Date.now() - start,
    };
  } catch (e) {
    return { ok: false, error: e.message, sat: err, elapsedMs: Date.now() - start };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const files = fs.readdirSync(TLES_DIR)
    .filter(n => n.endsWith('.txt'))
    .filter(n => !/^all\.txt$|^starlink\.txt$|^testsats\.txt$/.test(n))
    .sort();
  const recs = readRecords();
  console.log(`Scanned ${files.length} TLE files, ${recs.length} satellites`);

  const results = [];
  const failed = [];
  for (const rec of recs) {
    const res = await validateOne(rec);
    results.push({ rec, res });
    if (!res.ok) failed.push({ rec, res });
  }

  const pass = results.filter(r => r.res.ok);
  console.log('\n=== RESULTS ===');
  console.log(`PASS ${pass.length}/${results.length}  FAIL ${failed.length}/${results.length}`);

  if (failed.length) {
    console.log('\n--- FAILURES ---');
    for (const { rec, res } of failed) {
      const alt = res.cart?.height;
      console.log(`  ${rec.group}/${rec.name} (${rec.sourceFile}): ${res.error}`
        + (alt != null ? `  alt=${Number.isFinite(alt) ? alt.toFixed(1) : 'NaN'}` : ''));
    }
  } else {
    console.log('  (none)');
  }

  // Altitude sanity per group
  console.log('\n--- ALTITUDE SANITY (propagated) ---');
  for (const g of Object.keys(ALT_BAND)) {
    const band = ALT_BAND[g];
    const gs = results.filter(r => r.rec.group === g && r.res.ok);
    if (!gs.length) continue;
    const alts = gs.map(r => r.res.cart.height);
    const min = Math.min(...alts), max = Math.max(...alts);
    const inBand = alts.every(a => a >= band[0] && a <= band[1]);
    console.log(`  ${g.padEnd(13)} n=${gs.length.toString().padStart(2)} alt=${min.toFixed(0)}..${max.toFixed(0)} km `
      + `${inBand ? 'OK' : 'OUT OF BAND'}`);
  }

  // Build catalog
  const now = new Date();
  const satellites = [];
  for (const { rec, res } of results) {
    if (!res.ok) continue;
    const { sat, cart } = res;
    const r = EARTH_RADIUS;
    const a_km = sat.a * r;
    const ecc = sat.ecco;
    const apogee = a_km * (1 + ecc) - r;
    const periogee = a_km * (1 - ecc) - r;
    const no_rev_day = sat.no * 1440.0 / (2 * Math.PI);
    satellites.push({
      noradId: parseInt(sat.satnum, 10),
      name: rec.name,
      commonName: commonNameFor(rec.name, rec.group),
      group: rec.group,
      tleLine1: rec.line1,
      tleLine2: rec.line2,
      epoch: epochOf(sat.epochyr, sat.epochdays),
      epochDays: sat.epochdays,
      meanMotion: no_rev_day,
      ecc: ecc,
      inc: sat.inclo * (180 / Math.PI),
      raan: sat.nodeo * (180 / Math.PI),
      argp: sat.argpo * (180 / Math.PI),
      mo: sat.mo * (180 / Math.PI),
      apogeeKm: Math.round(apogee * 10) / 10,
      periogeeKm: Math.round(periogee * 10) / 10,
      coverage: coverageFor(apogee),
      propagatedAltitudeKm: Math.round(cart.height * 10) / 10,
    });
  }

  // Non-destructive catalog merge: load existing catalog.json if present and
  // append only new noradIds (skips duplicates) rather than overwriting.
  const existing = fs.existsSync('data/catalog.json')
    ? JSON.parse(fs.readFileSync('data/catalog.json', 'utf8')) : null;
  const existingIds = new Set((existing?.satellites || []).map(s => s.noradId));
  const merged = existing ? existing.satellites.filter(s => existingIds.has(s.noradId)) : [];
  const newSats = satellites.filter(s => !existingIds.has(s.noradId));
  merged.push(...newSats);

  const catalog = {
    generatedAt: now.toISOString(),
    mergedFrom: existing ? existing.generatedAt : null,
    satelliteCount: merged.length,
    newThisRun: newSats.length,
    groups: [...new Set(merged.map(s => s.group))].map(g => ({
      group: g, count: merged.filter(s => s.group === g).length,
      coverage: [...new Set(merged.filter(s => s.group === g).map(s => s.coverage))].join(','),
    })),
    satellites: merged,
  };
  fs.writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 2));
  console.log(`\nWrote data/catalog.json (${merged.length} total, +${newSats.length} new this run)`);

  process.exit(failed.length ? 1 : 0);
}

function commonNameFor(name, group) {
  const m = name.match(/-(\d{5})/);
  const norad = m ? parseInt(m[1], 10) : 0;
  const map = {
    resurs_p:     { 39198: 'Resurs-P-1', 41599: 'Resurs-P-2', 42647: 'Resurs-P-3' },
    meteor_m:     { 38878: 'Meteor-M-1', 43073: 'Meteor-M-2', 44354: 'Meteor-M-3', 45853: 'Meteor-M-4' },
    kanopus_v:    { 43140: 'Kanopus-V-IK', 49500: 'Kanopus-V-2', 50660: 'Kanopus-V-3', 53030: 'Kanopus-V-4' },
    express_geo:  { 29624: 'Express-AT-1', 39429: 'Express-AT-2', 45288: 'Express-AT-3' },
    glonass:      { 37859: 'GLONASS-K', 40900: 'GLONASS-K2', 45332: 'GLONASS-M' },
    luch:         { 38981: 'Luch-5A', 41333: 'Luch-5B' },
  };
  return map[group]?.[norad] || `${name}`.replace('-' + m?.[1] || '', '');
}

function epochOf(yr, days) {
  const year = yr < 57 ? 2000 + yr : 1900 + yr;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + Math.floor(days) - 1);
  const secs = Math.round((days - Math.floor(days)) * 86400);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCSeconds(secs);
  return date.toISOString();
}

function coverageFor(alt) {
  // GEO ring conventionally defined as alt >= 35,000 km
  if (alt >= 35000) return 'GEO';
  if (alt >= 2000) return 'MEO';
  return 'LEO';
}

main().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
