import datetime, math, random
rng = random.Random(42)
MU = 398600.4418
EARTH_RADIUS = 6378.137

def epoch_line(now):
    yday = now.timetuple().tm_yday
    frac_day = (now.hour*3600 + now.minute*60 + now.second + now.microsecond/1e6) / 86400.0
    frac_digits = f"{int(round(frac_day * 1e8)):08d}"
    return f"{now.year % 100:02d}{yday:03d}.{frac_digits}"

def fmt_ndot(d):
    return f"{d:+.8f}".replace("0.", ".")

def fmt_bstar(bstar):
    exp = math.ceil(math.log10(abs(bstar)))
    mant = abs(bstar) / 10**exp
    mant_s = f"{mant*100000:05.0f}"
    sign = '+' if bstar >= 0 else '-'
    return f"{sign}{mant_s}{exp:+d}"

def make_sat(norad, epoch_str, no, no_dot, bstar, ecc, argp, ma, raan, inc):
    cls = "26189A"
    line1_68 = (f"1 {norad:5d}U {cls:8s} {epoch_str:14s} {fmt_ndot(no_dot):10s} "
                f"00000-0  {fmt_bstar(bstar):8s} {rng.randint(10000,99999):5d}")
    chk = sum((int(c) if c.isdigit() else -1 if c=='-' else 0) for c in line1_68) % 10
    line1 = line1_68 + str(chk)
    ecc_s = f"{ecc:.6f}".replace('.', '')
    line2_68 = (f"2 {norad:5d} "
                f"{inc:.4f}".rjust(8, ' ') + " "
                f"{raan:.4f}".rjust(8, ' ') + " "
                f"{ecc_s:7s}" + " "
                f"{argp:.4f}".rjust(8, ' ') + " "
                f"{ma:.4f}".rjust(8, ' ') + " "
                f"{no:.8f}".rjust(11, ' ') + " "
                f"{rng.randint(1000,9999):4d}")
    chk2 = sum((int(c) if c.isdigit() else -1 if c=='-' else 0) for c in line2_68) % 10
    line2 = line2_68 + str(chk2)
    return line1, line2

now = datetime.datetime.now()
epoch_str = epoch_line(now)
l1, l2 = make_sat(48300, epoch_str, 15.06, -3.4e-5, 2.9252e-5, 0.0000496, 265.1296, 243.6118, 7.8436, 53.0)
print('L1 len', len(l1), 'L2 len', len(l2))
print('L1:', repr(l1))
print('L2:', repr(l2))
for k,s,e in [['inc',8,16],['node',17,25],['ecc',26,33],['argp',34,42],['mo',43,51],['no',52,63]]:
    print(k, JSON := __import__('json'), ' ->', l2[s:e])
