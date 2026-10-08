import fs from 'fs';
import * as S from './node_modules/satellite.mjs';
const l1 = fs.readFileSync('data/tles/real/glonass.txt','utf8').split('\n').filter(l=>l.trim().startsWith('1 '))[0];
const l2 = fs.readFileSync('data/tles/real/glonass.txt','utf8').split('\n').filter(l=>l.trim().startsWith('2 '))[0];
const sat = S.twoline2satrec(l1,l2);
console.log('keys:', Object.keys(sat).slice(0,20));
console.log('satnum:', sat.satnum, 'ecc:', sat.ecc, 'satrec.ecc:', sat.satrec?.ecc, 'prop sat.ecc:', S.propagate(sat, new Date()).sat?.ecc);