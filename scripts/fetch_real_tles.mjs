#!/usr/bin/env node
/**
 * Fetch real Russian-satellite TLEs from the CelesTrak snapshot mirror
 * (caelo-works/tle-mirror) and write them to data/tles/real/.
 *
 * Sources:
 *   - glonass:   tle/glo-ops.tle   (GLONASS operational)
 *   - all-active:tle/active.tle   (global active catalog incl. Russian GEO/LEO)
 *   - full catelog.tle      (global full catalog incl. Molniya)
 *
 * Mirror: https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/
 * Data:   © CelesTrak / Dr. T.S. Kelso. Snapshot refresh every 8h.
 *
 * Groups written:
 *   data/tles/real/glonass.txt -> @ GROUP=glonass  (MEO, 16000-23000 km)
 *   data/tles/real/geo.txt     -> @ GROUP=geo      (GEO + Molniya HEO, 100-48000 km)
 *   data/tles/real/rusnet.txt  -> @ GROUP=rusnet   (LEO Russian ops + Cosmos decoys)
 */

import fs from 'fs';
import * as S from '../node_modules/satellite.mjs';

const MIRROR = 'https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/';
const OUTDIR = 'data/tles/real';

// ---------- TLE parser (NORAD format; robust against digit-prefixed names) ----------
const TLE1 = /^1 [0-9]{5}U [0-9]{4}[A-Z0-9]+/;
const TLE2 = /^2 [0-9]{5} /;
function parseTLE(text) {
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
  const sats = [];
  let name = null;
  const pending = [];
  for (const line of lines) {
    if (TLE1.test(line) || TLE2.test(line)) {
      pending.push(line);
      if (pending.length === 2) {
        const satrec = S.twoline2satrec(pending[0], pending[1]);
        if (satrec.error === 0) {
          sats.push({
            name: (name || pending[0]).trim(),
            norad: parseInt(pending[0].slice(2, 7), 10),
            l1: pending[0],
            l2: pending[1],
          });
        } else {
          console.warn(`  parse fail (${satrec.error}): ${pending[0].slice(0,10)} ${pending[1].slice(0,10)}`);
        }
        pending.length = 0;
      }
    } else {
      name = line;
    }
  }
  return sats;
}

// ---------- Orbit classification helpers ----------
function classify(s) {
  // Mean motion n [rev/day], inc [rad], ecc dimensionless
  const n = s.satrec.no;
  const incDeg = s.satrec.inclo * (180 / Math.PI);
  const ecc = s.satrec.ecco;
  const a_km = s.satrec.a * 6378.137;
  const apogee = a_km * (1 + ecc) - 6378.137;
  const perigee = a_km * (1 - ecc) - 6378.137;
  return { n, incDeg, ecc, apogee, perigee, isGEO: (incDeg < 3 && n > 0.99 && n < 1.005), isMolniya: (n >= 1.9 && n <= 2.1 && incDeg >= 50), isMEO: (n >= 1.8 && n <= 2.3 && incDeg >= 60 && incDeg <= 70), isLEO: (n > 10.5 && n < 16 && incDeg > 55) };
}

async function propagateCheck(sats) {
  const bad = [];
  const perSatTimeout = 20000;
  for (const s of sats) {
    console.log(`    validating ${s.norad}/${s.name}...`);
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), perSatTimeout);
    try {
      const sat = S.twoline2satrec(s.l1, s.l2);
      if (sat.error !== 0) { bad.push({ name: s.name, norad: s.norad, error: `parse ${sat.error}` }); continue; }
      let res;
      try {
        res = S.propagate(sat, new Date());
      } catch (e) { bad.push({ name: s.name, norad: s.norad, error: `propagate ${e.message}` }); continue; }
      if (!res.position || !res.position.x) { bad.push({ name: s.name, norad: s.norad, error: 'no position' }); continue; }
      try {
        const cart = S.eciToGeodetic(res.position, new Date());
        if (!cart || !Number.isFinite(cart.height) || cart.height < 100 || cart.height > 100000) {
          bad.push({ name: s.name, norad: s.norad, error: `altitude ${Number.isFinite(cart.height) ? cart.height.toFixed(1) : 'NaN'} km` });
        }
      } catch (e) { bad.push({ name: s.name, norad: s.norad, error: `geodetic ${e.message}` }); }
    } catch (e) {
      if (e.name === 'AbortError') bad.push({ name: s.name, norad: s.norad, error: `timeout after ${perSatTimeout}ms` });
      else bad.push({ name: s.name, norad: s.norad, error: e.message });
    } finally {
      clearTimeout(id);
    }
  }
  return bad;
}

// ---------- Fetch source files ----------
async function download(name) {
  const r = await fetch(MIRROR + name);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.text();
}

// ---------- Main ----------
async function main() {
  console.log('RASSVET real-TLE fetch');
  console.log('Mirror: ' + MIRROR);

  const now = new Date();
  const out = {};
  const seen = new Map(); // norad -> {group, s}

  function add(group, s) {
    if (seen.has(s.norad) && seen.get(s.norad).group === group) return; // same-group dedupe
    if (seen.has(s.norad)) {
      console.warn(`  DUP norad ${s.norad} (${s.name}) seen in ${seen.get(s.norad).group} (skipping ${group})`);
      return;
    }
    seen.set(s.norad, { group, s });
    (out[group] = out[group] || []).push(s);
  }

  // --- glonass: glo-ops.tle (all operational) + active.tle [GLONASS-*]
  console.log('Fetching glo-ops.tle...');
  const gloOps = parseTLE(await download('glo-ops.tle'));
  for (const s of gloOps) add('glonass', s);

  console.log('Parsing active.tle...');
  const active = parseTLE(await download('active.tle'));
  for (const s of active) {
    if (/\[GLONASS/.test(s.name)) add('glonass', s);
  }

  // --- geo: EXPRESS / YAMAL / LUCH / GEO-IK / EKS from active + Molniya (epoch 2026) from catalog
  console.log('Parsing catalog.tle...');
  const catalog = parseTLE(await download('catalog.tle'));
  const geoNames = /^(EXPRESS|YAMAL|LUCH|GEO-IK|EKS)/;
  for (const s of active) {
    if (geoNames.test(s.name) || /(EKS \d)/.test(s.name)) add('geo', s);
  }
  for (const s of catalog) {
    if (/MOLNIYA/.test(s.name)) {
      const epochYear = parseInt(s.l1.slice(18, 20), 10);
      if (epochYear === 26) add('geo', s);  // active 2026 Molniya
    }
  }

  // --- rusnet: Resurs / Meteor / Kanopus / LEO-Express from active + Russian Cosmos decoys
  const rusName = /RESURS|METEOR|KANOPUS|LEO EXPRESS/i;
  for (const s of active) {
    if (rusName.test(s.name)) add('rusnet', s);
  }
  const decoys = new Set([2561,2588,2589,2590,2591,2592,2593,2594,2595,2600,2601,2602,2603,2604,2605,2606,2607,2608,2609,2610,2611,2612,2613,2614,2615,2616,2617,2618]);
  for (const s of active) {
    if (/^COSMOS (\d+)/.test(s.name)) {
      const id = parseInt(RegExp.$1, 10);
      if (decoys.has(id)) add('rusnet', s);
    }
  }

  // --- Validate propagation + classify by orbit
  console.log('\nValidating & classifying...');
  let total = 0, failed = 0;
  for (const g of ['glonass', 'geo', 'rusnet']) {
    if (!out[g]) { out[g] = []; continue; }
    const bad = await propagateCheck(out[g]);
    failed += bad.length;
    for (const b of bad) console.log(`  FAIL: ${g}/${b.name} (NORAD ${b.norad}): ${b.error}`);
    out[g] = out[g].filter(s => !bad.find(b => b.norad === s.norad));
    const classes = {};
    for (const s of out[g]) {
      const c = classify(s);
      const key = c.isGEO ? 'GEO' : c.isMolniya ? 'Molniya(HEO)' : c.isMEO ? 'MEO' : c.isLEO ? 'LEO' : 'OTHER';
      classes[key] = (classes[key] || 0) + 1;
      total++;
    }
    console.log(`  ${g}: ${out[g].length} sats  [${Object.entries(classes).map(([k,v])=>`${k}:${v}`).join(', ')}]`);
  }
  console.log(`\nTotal: ${total}, propagation failures: ${failed}`);

  // --- Write files
  console.log('\nWriting to ' + OUTDIR + '/...');
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  // get mirror updated timestamp
  let refresh = 'unknown';
  try {
    const up = await download('updated.txt');
    refresh = up.trim() || 'unknown';
  } catch (e) { refresh = 'unknown'; }

  for (const g of ['glonass', 'geo', 'rusnet']) {
    if (!out[g].length) { console.warn('  skip ' + g + ': no satellites'); continue; }
    const lines = [`# RASSVET — real ${g} satellite TLEs (data collection pass)`,
                   `# Source: CelesTrak GP element set via caelo-works/tle-mirror (snapshot, every 8h):`,
                   `#   https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/`,
                   `# Data:    © CelesTrak / Dr. T.S. Kelso`,
                   `# Mirror refreshed: ${refresh}`,
                   `# Retrieval: ${now.toISOString()}`,
                   ``,
                   `@ GROUP=${g}`,
                   ''];
    const groupSats = out[g].sort((a, b) => a.norad - b.norad);
    for (const s of groupSats) {
      lines.push(s.name);
      lines.push(s.l1);
      lines.push(s.l2);
      lines.push('');
    }
    const content = lines.join('\n');
    fs.writeFileSync(`${OUTDIR}/${g}.txt`, content);
    console.log(`  wrote ${groupSats.length} ${g} satellites -> ${OUTDIR}/${g}.txt`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error('HARNESS:', e); process.exit(1); });
