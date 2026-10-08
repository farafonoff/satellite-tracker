import * as S from './node_modules/satellite.mjs';
const l1 = "1 25544U 98067A   23266.55437397 .00011857 00000-0  58966-3 0  9990";
const l2 = "2 25544  51.6419 339.8001 0003936 104.4915 136.9144 15.49754891427991";
const sat = S.twoline2satrec(l1, l2);
console.log("no:", sat.no, "inc:", sat.inclo, "ecc:", sat.ecco, "a:", sat.a);
const res = S.propagate(sat, new Date("2023-09-23T13:11:00Z"));
const cart = S.eciToGeodetic(res.position, new Date("2023-09-23T13:11:00Z"));
console.log("alt:", cart.height, "lat:", cart.latitude, "lon:", cart.longitude);
