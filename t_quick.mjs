import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const lines = fs.readFileSync('data/tles/all.txt','utf8').trim().split(/\r?\n/).filter(l=>l.trim());
let ok=0, bad=0;
for (let i=0;i<lines.length-2;i++) {
  if (lines[i].trim().startsWith('1') && lines[i+1].trim().startsWith('2')) {
    const sat = S.twoline2satrec(lines[i].trim(), lines[i+1].trim());
    if (!sat) { bad++; console.log('PARSE FAIL:', lines[i-1].trim()); i+=2; continue; }
    const res = S.propagate(sat, new Date());
    const cart = S.eciToGeodetic(res.position, S.gstime(new Date()));
    if (sat.error || cart.height < 100 || cart.height > 10000) { bad++; console.log('BAD:', lines[i-1].trim(), 'err', sat.error, 'alt', cart.height); i+=2; continue; }
    ok++;
    i+=2;
  }
}
console.log(`Parsed ${ok}/${ok+bad} OK`);
