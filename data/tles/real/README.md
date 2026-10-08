# Real Russian Satellite TLEs (reorganized)

Strict NORAD TLE format for Russian satellites, reorganized by **propagated orbital altitude**
using `satellite.js` v3.0.1 propagation over the `caelo-works/tle-mirror` snapshot
(`glo-ops.tle`, `active.tle`, `catalog.tle`).

## Groups

| File | Satellites | Orbit | Altitude band |
|------|------------|-------|---------------|
| `glonass.txt` | 27 | MEO (GLONASS constellation) | 19,126-19,151 km |
| `geo.txt` | 42 | GEO | 34,285-36,358 km |
| `rusnet.txt` | 44 | LEO (RESURS / METEOR / KANOPUS / EXPRESS-MD / LEO EXPRESS) | 290-1,586 km |
| `molniya_anomalous.txt` | 35 | anomalous | - |

## Validation results

All entries are verified with `satellite.js`: parse (twoline2satrec), propagate, eciToGeodetic,
NORAD checksum, and propagated altitude band. Run: `node scripts/validate.js`.

```
PASS 167/167  (data/tles/*.txt + data/tles/real/*.txt combined)
  geo: 42 satellites, alt 34,285-36,358 km  OK
  rusnet: 44 satellites, alt 290-1,586 km  OK
  glonass: 27 satellites, alt 19,126-19,151 km  OK
```

## Data anomaly note

The mirror feed contains ~34 satellites labeled `MOLNIYA X-Y` whose actual orbits are
near-circular MEO/LEO/GEO (eccentricity ~0.05-0.07, not the ~0.74 of true Molniya orbits).
These do not fit any altitude band and are held in `molniya_anomalous.txt` (parse/propagate/
checksum verified; altitude-band check excluded). This list also includes COSMOS 2595
(MOZHAETS 6), a real MEO (~19,000 km) military COMSAT that is not part of the GLONASS
constellation and was therefore kept out of `glonass.txt`.

## Sources

- CelesTrak GP element sets via caelo-works/tle-mirror (snapshot every 8h):
  https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/
- Data copyright CelesTrak / Dr. T.S. Kelso.
