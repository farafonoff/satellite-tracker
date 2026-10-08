import * as S from './node_modules/satellite.mjs';

// Line1: after "21059A" 3 spaces (field ends 16, gap 17), after "-.00003425" 1 space then "00000-0" then 2 spaces then bstar
const tl1 = ["1 48300U 21059A   26279.93105369 -.00003425 00000-0  +00029-5 20213 0",
             "2 48300 53.0000  358.3200 0000205 265.1296 243.6118 15.06051232 1234 0"];
const tl2 = ["1 25544U 98067A   06217.38352296 -.00017739 00000-0  +36675-3 08973 4",
             "2 25544 52.8804  327.9801 0003936 248.4818  77.3269 15.06961017 3688 3"];

const tests = [["TL1", tl1], ["TL2", tl2]];
tests.forEach(([name, tl]) => {
  const s = S.twoline2satrec(tl[0], tl[1]);
  console.log(`--- ${name} ---`);
  console.log("satnum:", s.satnum, "epoch:", s.epochyr, s.epochdays,
              "ecc:", s.ecco.toFixed(7), "inc:", (s.inclo*180/Math.PI).toFixed(4),
              "node:", (s.nodeo*180/Math.PI).toFixed(4), "argp:", (s.argpo*180/Math.PI).toFixed(2),
              "mo:", (s.mo*180/Math.PI).toFixed(2), "no:", s.no.toFixed(8),
              "alt(km):", ((s.a-1)*6378.137).toFixed(0), "bstar:", s.bstar);
});
