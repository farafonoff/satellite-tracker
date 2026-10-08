import datetime, math, random
rng = random.Random(42)
def epoch(now):
    yd = now.timetuple().tm_yday
    fd = (now.hour*3600+now.minute*60+now.second+now.microsecond/1e6)/86400
    return f"{now.year%100:02d}{yd:03d}.{int(round(fd*1e8)):08d}"
def chk(s):
    return sum((int(c) if c.isdigit() else -1 if c=='-' else 0) for c in s) % 10
def ndot(d): return f"{d:+.8f}".replace("0.", ".")
def bstar(v):
    e = math.ceil(math.log10(abs(v))); m = abs(v)/10**e
    return f"+{m*100000:05.0f}{e:+d}"

def sat(norad, no, no_dot, bs, ecc, argp, ma, raan, inc, yr):
    ep = epoch(datetime.datetime.now())
    cls = f"{yr%100:02d}189A"
    l1data = f"1 {norad:5d}U {cls:8s} {ep:14s} {ndot(no_dot):10s} 00000-0  {bstar(bs):8s} {rng.randint(10000,99999):5d}"
    l1 = l1data + str(chk(l1data))
    ecc_s = f"{ecc:.6f}".replace('.','')
    l2data = (f"2 {norad:5d} "
              + f"{inc:.4f}".rjust(8, ' ') + " "
              + f"{raan:.4f}".ljust(8, ' ') + " "
              + ecc_s + " "
              + f"{argp:.4f}".ljust(8, ' ') + " "
              + f"{ma:.4f}".ljust(8, ' ') + " "
              + f"{no:.8f}".ljust(11, ' ') + " "
              + f"{rng.randint(1000,9999):4d}")
    l2 = l2data + str(chk(l2data))
    print("l1", len(l1), repr(l1))
    print("l2", len(l2), repr(l2))
    assert len(l1) == 68, len(l1)
    assert len(l2) == 68, len(l2)
    print("l2 field positions: inc", repr(l2[8:16]), "node", repr(l2[17:25]), "ecc", repr(l2[26:33]),
          "argp", repr(l2[34:42]), "mo", repr(l2[43:51]), "no", repr(l2[52:63]))
    return l1, l2

sat(48300, 15.06048353, -3.4e-5, 2.9252e-5, 0.0000496, 265.1296, 243.6118, 7.8436, 53.0, 2026)
