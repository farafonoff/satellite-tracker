import * as S from './node_modules/satellite.mjs';

const tle1 = [
  ["1 48300U 21059A   26279.93105369 -.00003425  00000-0  +00029-5 20213 0",
   "2 48300  53.0000 358.3200 0000205  265.1296   243.6118  15.06051232 12345 0"],
  // real-style GEO:
  ["1 25544U 98067A   06217.38352296 -.00017739  00000-0  +36675-3 08973 4",
   "2 25544  52.8804 327.9801 0003936 248.4818  77.3269 15.06961017 3688 3"],
];

tle1.forEach((tl, i) => {
  const s = S.twoline2satrec(tl[0], tl[1]);
  console.log(`--- case ${i+1} ---`);
  console.log("satnum:", s.satnum, "epochyr:", s.epochyr, "epochdays:", s.epochdays);
  console.log("ecc:", s.ecco.toFixed(7), "inc:", (s.inclo*180/Math.PI).toFixed(4), "node:", (s.nodeo*180/Math.PI).toFixed(4),
              "argp:", (s.argpo*180/Math.PI).toFixed(2), "mo:", (s.mo*180/Math.PI).toFixed(2));
  console.log("no:", s.no.toFixed(8), "ndot:", s.ndot.toFixed(12));
});
