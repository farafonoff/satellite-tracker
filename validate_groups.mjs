import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
import * as path from 'path';

const BASE = 'data/tles/real';
const bands = { glonass: [17000, 22000], geo: [33500, 36500], rusnet: [280, 1600] };
const groups = ['glonass', 'geo', 'rusnet'];
const now = new Date();

let totals = { parse: 0, prop: 0, checksum: 0, fail: 0 };
const detail = [];

async function run() {
  for (const grp of groups) {
    const text = fs.readFileSync(path.join(BASE, grp + '.txt'), 'utf8');
    const lines = text.split('\n').map(l => l.trim()).filter(l => /^1\s+\d/.test(l) || /^2\s+\d/.test(l));
    for (let i = 0; i < lines.length; i += 2) {
      const l1 = lines[i], l2 = lines[i + 1];
      if (!l2) { console.log('orphan:', l1); totals.fail++; continue; }
      const sat = S.twoline2satrec(l1, l2);
      if (!sat || sat.error || sat.satnum === undefined) { console.log('PARSE FAIL', l1); totals.parse++; totals.fail++; continue; }
      const res = S.propagate(sat, now);
      if (!res.position || res.error) { console.log('PROP FAIL', l1, res.error); totals.prop++; totals.fail++; continue; }
      const gmst = S.gstime(S.jday(now));
      const pos = S.eciToGeodetic(res.position, gmst);
      const alt = pos.height;
      let cs = 0;
      for (let j = 0; j < l1.length - 1; j++) {
        const c = l1[j];
        if (c >= '0' && c <= '9') cs += c.charCodeAt(0) - 48;
        else if (c === '-') cs -= 1;
      }
      const csok = cs % 10 === parseInt(l1[68]);
      if (!csok) { console.log('CHECKSUM FAIL', sat.satnum, cs % 10, l1[68]); totals.checksum++; totals.fail++; }
      const b = bands[grp];
      const inBand = (b[0] <= alt && alt <= b[1]);
      detail.push({ grp, norad: sat.satnum, alt_km: alt.toFixed(1), inBand });
      if (!inBand) {
        console.log('ALT OUT OF BAND', grp, sat.satnum, alt.toFixed(1), 'km, band', b);
        totals.fail++;
      }
    }
  }
  console.log('\n=== VALIDATION RESULTS ===');
  console.log('parse fail:', totals.parse, '| propagate fail:', totals.prop, '| checksum fail:', totals.checksum, '| altitude band fail:', totals.fail);
  for (const grp of groups) {
    const sub = detail.filter(d => d.grp === grp);
    const a = sub.map(d => +d.alt_km);
    console.log(grp, ': satellites=', sub.length, ', alt range=', Math.min(...a).toFixed(1), '-', Math.max(...a).toFixed(1), 'km, band fail=', sub.filter(d => !d.inBand).length);
  }
  process.exit(totals.fail ? 1 : 0);
}
run();
