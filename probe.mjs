import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const now = new Date();
for (const grp of ['glonass','geo','rusnet']) {
  const text = fs.readFileSync('data/tles/real/' + grp + '.txt', 'utf8');
  const lines = text.split('\n').map(l=>l.trim()).filter(l => /^1\s+[0-9]/.test(l) || /^2\s+[0-9]/.test(l));
  for (let i=0; i<lines.length; i+=2) {
    const l1 = lines[i], l2 = lines[i+1];
    if (!l2) { console.log('orphan', l1); continue; }
    const sat = S.twoline2satrec(l1, l2);
    const res = S.propagate(sat, now);
    const gmst = S.gstime(S.jday(now));
    const pos = S.eciToGeodetic(res.position, gmst);
    const alt = pos.height;
    const ecc = sat.ecco;
    let band = alt > 33000 ? 'GEO' : (alt > 17000 ? 'MEO' : 'LEO');
    let flag = '';
    if (ecc > 0.6) flag = ' MOLNIYA';
    else if (alt < 300 || alt > 23000) flag = ' STRAY';
    console.log(`${sat.satnum} ${alt.toFixed(0).padStart(7)}km ${band.padEnd(4)} ecc=${ecc.toFixed(3)} ${flag}  [${grp}]`);
  }
}
