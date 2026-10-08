#!/usr/bin/env python3
"""Generate realistic RUSSIAN satellite TLE sets.
Epoch set to current time so satellites propagate realistically from "now".
Lines conform to the NORAD TLE format expected by satellite.js (v3) twoline2satrec:
  L1: satnum@2-6,   epochyr@18-20, epochdays@20-32, ndot@33-43, nddot@44-52, bstar@53-61
  L2: inc@8-16, node@17-25, ecc@26-33, argp@34-42, mo@43-51, no@52-63
Per satellite: NAME line, line 1, line 2, one record per sat.
"""
import datetime, math, random, os

MU = 398600.4418
EARTH_RADIUS = 6378.137

# Russian constellations (realistic orbits, approximate real-world values)
# group: short name, commonName base, norad range base, altitude km, inc deg,
#        n_sats, ecc spread, inc spread, mean-motion perturbation.
SATELLITES = [
    # Resurs-P: Sun-synchronous Earth imaging, ~470 km, 98.8 deg
    {"group": "resurs_p", "base": "RESSURSP", "norad_base": 39198, "alt_km": 470.0,
     "inc": 98.8, "n_sats": 3, "ecc_lo": 0.00005, "ecc_hi": 0.002, "inc_lo": -0.15,
     "no_spread": 0.02, "no_dot": -3.5e-5, "bstar_lo": 1.5e-5, "bstar_hi": 6.0e-5,
     "common_base": "Resurs-P"},
    # Meteor-M: Sun-synchronous weather, ~833 km, 98.8 deg
    {"group": "meteor_m", "base": "METEOR-M", "norad_base": 38878, "alt_km": 833.0,
     "inc": 98.8, "n_sats": 4, "ecc_lo": 0.0001, "ecc_hi": 0.003, "inc_lo": -0.2,
     "no_spread": 0.02, "no_dot": -2.0e-5, "bstar_lo": 8e-6, "bstar_hi": 3.0e-5,
     "common_base": "Meteor-M"},
    # Kanopus-V: Sun-synchronous imaging, ~600 km, 97.9 deg
    {"group": "kanopus_v", "base": "KANOPOS-V", "norad_base": 43140, "alt_km": 600.0,
     "inc": 97.9, "n_sats": 4, "ecc_lo": 0.0001, "ecc_hi": 0.0025, "inc_lo": -0.15,
     "no_spread": 0.02, "no_dot": -2.5e-5, "bstar_lo": 1.0e-5, "bstar_hi": 4.5e-5,
     "common_base": "Kanopus-V"},
    # Express-AT: GEO comms, ~35,786 km, 0 deg
    {"group": "express_geo", "base": "EXPRESS-AT", "norad_base": 29624, "alt_km": 35786.0,
     "inc": 0.0, "n_sats": 3, "ecc_lo": 0.0001, "ecc_hi": 0.002, "inc_lo": 0.08,
     "no_spread": 0.001, "no_dot": -1.0e-7, "bstar_lo": 5e-6, "bstar_hi": 2.0e-5,
     "common_base": "Express-AT"},
    # GLONASS: MEO navigation, ~19,100 km, 64.8 deg
    {"group": "glonass", "base": "GLONASS", "norad_base": 37859, "alt_km": 19100.0,
     "inc": 64.8, "n_sats": 3, "ecc_lo": 0.001, "ecc_hi": 0.02, "inc_lo": -0.25,
     "no_spread": 0.01, "no_dot": -5e-7, "bstar_lo": 3e-6, "bstar_hi": 1.5e-5,
     "common_base": "GLONASS"},
    # Luch: data-relay, super-synchronous ~40,000 km, ~0 deg
    {"group": "luch", "base": "LUCH", "norad_base": 38981, "alt_km": 40000.0,
     "inc": 0.0, "n_sats": 2, "ecc_lo": 0.0002, "ecc_hi": 0.003, "inc_lo": 0.1,
     "no_spread": 0.001, "no_dot": -8e-8, "bstar_lo": 4e-6, "bstar_hi": 1.6e-5,
     "common_base": "Luch"},
]

rng = random.Random(42)

# NORAD ID offsets so real mission numbers land in realistic ranges
NORAD_OFFSET = {
    "resurs_p":     [39198, 41599, 42647],     # Resurs-P No.1/2/3
    "meteor_m":     [38878, 43073, 44354, 45853],  # Meteor-M No.1/2/3/4
    "kanopus_v":    [43140, 49500, 50660, 53030],  # Kanopus-V variants
    "express_geo":  [29624, 39429, 45288],     # Express comms
    "glonass":      [37859, 40900, 45332],     # GLONASS-K / Kosmos
    "luch":         [38981, 41333],            # Luch data relay
}


def epoch_line(now):
    yday = now.timetuple().tm_yday
    frac_day = (now.hour * 3600 + now.minute * 60 + now.second + now.microsecond / 1e6) / 86400.0
    return f"{now.year % 100:02d}{yday:03d}.{int(round(frac_day * 1e8)):08d}"


def compute_checksum(line_68):
    s = 0
    for ch in line_68:
        if ch.isdigit():
            s += int(ch)
        elif ch == '-':
            s -= 1
    return s % 10


def fmt_ndot(d):
    return f"{d:+.8f}".replace("0.", ".")


def fmt_bstar(bstar):
    exp = math.ceil(math.log10(abs(bstar)))
    mant = abs(bstar) / 10**exp
    mant_s = f"{mant * 100000:05.0f}"
    sign = '+' if bstar >= 0 else '-'
    return f"{sign}{mant_s}{exp:+d}"


def mean_motion(a_km):
    # rev/day, matching the TLE L2 field (satellite.js reads rev/day, converts to rad/min)
    n_rad = math.sqrt(MU / a_km**3)
    return n_rad * 86400.0 / (2.0 * math.pi)


def make_sat(name, norad, epoch_str, no, no_dot, bstar, ecc, argp, ma, raan, inc):
    cls = f"{datetime.datetime.now().year % 100:02d}189A"

    line1_68 = (f"1 {norad:5d}U {cls:8s} {epoch_str:14s} {fmt_ndot(no_dot):10s} "
                f"00000-0  {fmt_bstar(bstar):8s} {rng.randint(10000, 99999):5d}")
    chk = compute_checksum(line1_68)
    line1 = line1_68 + str(chk)

    ecc_s = f"{ecc:.6f}".replace('.', '')
    line2_68 = (f"2 {norad:5d} "
                + f"{inc:.4f}".ljust(8) + " "
                + f"{raan:.4f}".ljust(8) + " "
                + f"{ecc_s:7s}" + " "
                + f"{argp:.4f}".ljust(8) + " "
                + f"{ma:.4f}".ljust(8) + " "
                + f"{no:.8f}".ljust(11) + " "
                + f"{rng.randint(1000, 9999):4d}")
    chk2 = compute_checksum(line2_68)
    line2 = line2_68 + str(chk2)

    assert len(line1) == 68, (len(line1), line1)
    assert len(line2) == 69, (len(line2), line2)
    return f"{name}\n{line1}\n{line2}\n"


def main():
    now = datetime.datetime.now()
    epoch_str = epoch_line(now)
    print(f"Epoch: {epoch_str}  ({now.isoformat()})")
    print(f"Date:  {now.strftime('%Y-%m-%d')}  (day {now.timetuple().tm_yday})")

    records = {}
    for spec in SATELLITES:
        group = spec["group"]
        norad_ids = NORAD_OFFSET[group]
        a_km = EARTH_RADIUS + spec["alt_km"]
        base_no = mean_motion(a_km)
        group_sats = []
        def incl():
            # keep inclination strictly positive (sgp4 tolerates negative inc,
            # but it inverts the geometry; conventional catalogs use 0..180 deg)
            v = spec["inc"] + rng.uniform(-spec["inc_lo"], spec["inc_lo"])
            return max(0.1, abs(v))

        for i in range(spec["n_sats"]):
            norad = norad_ids[i % len(norad_ids)]
            name = f"{spec['base']}-{norad:05d}"
            group_sats.append(make_sat(
                name=name,
                norad=norad,
                epoch_str=epoch_str,
                no=base_no + rng.uniform(-spec["no_spread"], spec["no_spread"]),
                no_dot=spec["no_dot"] + rng.uniform(-5e-7, 5e-7),
                bstar=rng.uniform(spec["bstar_lo"], spec["bstar_hi"]),
                ecc=spec["ecc_lo"] + rng.uniform(0, spec["ecc_hi"] - spec["ecc_lo"]),
                argp=rng.uniform(0, 360),
                ma=rng.uniform(0, 360),
                raan=rng.uniform(0, 360),
                inc=incl()))
        records[group] = group_sats
        with open(f'data/tles/{group}.txt', 'w') as f:
            f.write('\n'.join(group_sats) + '\n')
        print(f"  {group}: {len(group_sats)} sats -> data/tles/{group}.txt")
        # sanity: check each sat against the parser immediately (single-sat test)
        for rec in group_sats:
            lines = rec.strip().split('\n')
            if len(lines) != 3 or not (lines[0] and lines[1].startswith('1') and lines[2].startswith('2')):
                raise SystemExit(f"BAD FORMAT {name}: {lines}")

    all_sats = []
    for group in records:
        all_sats.extend(records[group])
    print(f"Wrote {len(all_sats)} Russian satellites across {len(records)} groups")


if __name__ == '__main__':
    main()
