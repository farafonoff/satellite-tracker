import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const now = new Date();
for (const grp of ['glonass','geo','rusnet']) {
  const text = fs.readFileSync('data/tles/real/' + grp + '.txt', 'utf8');
  const lines = text.split('\n').map(l=>l.trim()).filter(l => /^1 [0-9]/.test(l) || /^2 [0-9]/.test(l));
  for (let i=0; i<lines.length; i+=2) {
    const sat = S.twoline2satrec(lines[i], lines[i+1]);
    const res = S.propagate(sat, now);
    const gmst = S.gstime(S.jday(now));
    const pos = S.eciToGeodetic(res.position, gmst);
    const alt = pos.height;
    const norad = sat.satnum;
    let band;
    if (alt > 33000) band = 'GEO';
    else if (alt > 16000) band = 'MEO';
    else band = 'LEO';
    console.log(`${norad} ${alt.toFixed(0).padStart(7)}km ${band.padEnd(5)} in ${grp}`);
  }
}
