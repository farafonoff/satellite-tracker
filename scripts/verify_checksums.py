#!/usr/bin/env python3
import glob

def chk(s):
    s_ = 0
    for ch in s:
        if ch.isdigit():
            s_ += int(ch)
        elif ch == '-':
            s_ -= 1
    return s_ % 10

names = ['resurs_p', 'meteor_m', 'kanopus_v', 'express_geo', 'glonass', 'luch']
bad = 0
ok = 0
for name in names:
    lines = [l for l in open(f'data/tles/{name}.txt').read().splitlines() if l.strip()]
    assert len(lines) % 3 == 0, name
    for j in range(0, len(lines) - 2, 3):
        n1, l1, l2 = lines[j], lines[j+1], lines[j+2]
        c1 = chk(l1[:-1]); c2 = chk(l2[:-1])
        s1 = int(l1[-1]); s2 = int(l2[-1])
        if c1 != s1 or c2 != s2:
            bad += 1
            print('FAIL', n1)
            print('  L1 chk=%d stored=%d | L2 chk=%d stored=%d' % (c1, s1, c2, s2))
            print('  L1:', repr(l1))
            print('  L2:', repr(l2))
        else:
            ok += 1
print('records checked: %d, bad: %d' % (ok, bad))
