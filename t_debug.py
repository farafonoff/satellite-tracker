import datetime, math, random
rng = random.Random(42)
def epoch_line(now):
    yday = now.timetuple().tm_yday
    frac_day = (now.hour*3600 + now.minute*60 + now.second + now.microsecond/1e6) / 86400.0
    frac_digits = f"{int(round(frac_day * 1e8)):08d}"
    return f"{now.year % 100:02d}{yday:03d}.{frac_digits}"
now = datetime.datetime.now()
epoch_str = epoch_line(now)
no = 15.06
no11 = f"{no:.8f}".rjust(11, ' ')
print("no11 =", repr(no11), "len", len(no11))
inc8 = f"{53.0:.4f}".rjust(8, ' ')
raan8 = f"{7.8436:.4f}".rjust(8, ' ')
ecc_s = "0000050"
print("inc8 =", repr(inc8), "raan8 =", repr(raan8))
line2_68 = (f"2 48300 " + inc8 + " " + raan8 + " " + ecc_s + " " + "265.1296" + " " + "243.6118" + " " + no11 + " " + "2824")
print("L2 len", len(line2_68))
l = line2_68
for i, ch in enumerate(l):
    print(i, repr(ch))
