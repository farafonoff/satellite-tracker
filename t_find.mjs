import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const lines = fs.readFileSync('data/tles/all.txt','utf8').trim().split(/\r?\n/).filter(l=>l.trim());
for (let i=0;i<lines.length-2;i++) {
  if (lines[i].trim().startsWith('1') && lines[i+1].trim().startsWith('2')) {
    const sat = S.twoline2satrec(lines[i].trim(), lines[i+1].trim());
    const res = S.propagate(sat, new Date());
    const cart = S.eciToGeodetic(res.position, S.gstime(new Date()));
    if (!sat || !cart || isNaN(cart.height)) { console.log('BAD:', lines[i-1].trim()); break; }
    i+=2;
  }
}
console.log('DONE all');
