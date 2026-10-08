import * as S from './node_modules/satellite.mjs';
import fs from 'fs';
const lines = fs.readFileSync('data/tles/starlink.txt', 'utf8');
const rows = lines.trim().split(/\r?\n/).filter(l => l.trim());
let ok = 0, bad = 0;
for (let i = 0; i < rows.length - 2; i++) {
  if (rows[i].trim().startsWith('1') && rows[i+1].trim().startsWith('2')) {
    const name = rows[i-1].trim();
    console.log("LINE1:", JSON.stringify(rows[i].trim()));
    console.log("LINE2:", JSON.stringify(rows[i+1].trim()));
    const sat = S.twoline2satrec(rows[i].trim(), rows[i+1].trim());
    console.log("parse result:", JSON.stringify(sat));
    if (!sat) { console.log("sat object:", JSON.stringify(sat));} { bad++; console.log("PARSE FAIL:", name); i+=2; continue; }
    const pos = S.propagate(sat, new Date()).position;
    const cart = S.eciToGeodetic(pos, S.gstime(new Date()));
    ok++;
    if (ok <= 3) console.log(`sat ${ok}: ${name} | alt:${Math.round(cart.height)}km ecc:${sat.ecc.toFixed(6)} inc:${sat.inc.toFixed(4)} node:${sat.node.toFixed(2)} argp:${sat.argp.toFixed(1)} ma:${sat.ma.toFixed(1)} no:${sat.no.toFixed(4)}`);
    i += 2;
  }
}
console.log(`Parsed ${ok} satellites OK, ${bad} failed`);
