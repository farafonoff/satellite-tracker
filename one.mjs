import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const lines = fs.readFileSync('data/tles/real/glonass.txt','utf8').split('\n').map(l=>l.trim()).filter(l => /^1 [0-9]/.test(l) || /^2 [0-9]/.test(l));
console.log('L1:', JSON.stringify(lines[0]));
console.log('L2:', JSON.stringify(lines[1]));
const sat = S.twoline2satrec(lines[0], lines[1]);
console.log('sat:', sat.error, sat.satnum, sat.a, sat.ecco);
const r = S.propagate(sat, new Date());
console.log('r:', r.error, 'pos:', r.position);
