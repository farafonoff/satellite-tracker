import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const lines = fs.readFileSync('data/tles/all.txt','utf8').trim().split(/\r?\n/).filter(l=>l.trim());
let ok=0, bad=0, altTot=0, n=0, firstErr=null;
for (let i=0;i<lines.length-2;i++) {
  if (lines[i].trim().startsWith('1') && lines[i+1].trim().startsWith('2')) {
    const sat = S.twoline2satrec(lines[i].trim(), lines[i+1].trim());
    const pos = S.propagate(sat, new Date()).position;
    const cart = S.eciToGeodetic(pos, S.gstime(new Date()));
    const alt = cart.height;
    if (sat.error || sat.error || alt < 100 || alt > 10000) { bad++; if (!firstErr) { firstErr = `${lines[i-1].trim()} alt=${alt.toFixed(0)} err=${sat.error}`; } i+=2; continue; }
    altTot += alt; n++; ok++;
    i+=2;
  }
}
console.log(`Parsed ${ok}/${ok+bad} OK`);
if (firstErr) console.log('first bad:', firstErr);
console.log('mean altitude:', (altTot/n).toFixed(0), 'km');
console.log('sample: STARLINK mean vs TEST mean');
