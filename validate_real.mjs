import fs from 'fs';
import * as S from './node_modules/satellite.mjs';

const TLES_DIR = 'data/tles/real';
const bands = { glonass: [17000, 21000], geo: [33000, 37000], rusnet: [300, 15000] };
const now = new Date();

let ok=0, fail=0, parseErr=0, propErr=0, outRange=0;
for (const grp of ['glonass','geo','rusnet']) {
  const text = fs.readFileSync(TLES_DIR + '/' + grp + '.txt', 'utf8');
  const lines = text.split('\n').map(l=>l.trim()).filter(l => /^1 [0-9]/.test(l) || /^2 [0-9]/.test(l));
  for (let i=0; i<lines.length; i+=2) {
    const l1 = lines[i], l2 = lines[i+1];
    if (!l2) { console.log('orphan line:', l1); fail++; continue; }
    const sat = S.twoline2satrec(l1, l2);
    if (!sat || sat.error !== 0) { console.log('PARSE FAIL', l1); parseErr++; fail++; continue; }
    const res = S.propagate(sat, now);
    if (!res.position || res.error) { console.log('PROP FAIL', l1, res.error); propErr++; fail++; continue; }
    const gmst = S.gstime(S.jday(now));
    const pos = S.eciToGeodetic(res.position, gmst);
    const alt = pos.height; // km // km
    const satnum = sat.satnum;
    const a = (bands[grp][0] <= alt && alt <= bands[grp][1]);
    if (!a) { console.log('ALT OUT', grp, satnum, alt.toFixed(1), 'km'); outRange++; fail++; continue; }
    ok++;
  }
}
console.log('PASSED:', ok, 'FAILED:', fail, '(parse:', parseErr, 'prop:', propErr, 'out-of-range:', outRange, ')');
process.exit(fail ? 1 : 0);
