#!/usr/bin/env python3
"""
Acquire real Russian-satellite TLEs from the CelesTrak snapshot mirror
(caelo-works/tle-mirror), reformat to strict NORAD TLE format, and write
data/tles/real/{glonass,geo,rusnet}.txt.

Sources:
  glo-ops.tle   - GLONASS operational constellation
  active.tle    - all active satellites (incl. Russian GEO/LEO)
  catalog.tle   - full NORAD catalog (incl. active Molniya)
Mirror: https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/
Data:   © CelesTrak / Dr. T.S. Kelso. Refreshed every 8h.

Strict NORAD line formats (gen_tles.py convention):
  Line 1: 68 chars + checksum (NORAD cat id, class, launch ID, epoch,
           mean-motion derivative, 00000-0 placeholder, bstar, elm no)
  Line 2: 69 chars + checksum (incl, raan, ecc, argp, ma, mean motion, rev)
"""
import re, sys, os, json, datetime, math

sys.path.insert(0, '/Users/artem_farafonov/Projects/satelliteTracker/scripts')
import urllib.request

MIRROR = 'https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/'

MU = 398600.4418


def fmt_ndot(d):
    return f"{d:+.8f}".replace('0.', '.')


def fmt_bstar(bstar):
    if bstar == 0:
        return '+00000+0'
    exp = math.ceil(math.log10(abs(bstar)))
    mant = abs(bstar) / 10**exp
    mant_s = f"{mant*100000:05.0f}"
    sign = '+' if bstar >= 0 else '-'
    return f"{sign}{mant_s}{exp:+d}"


def compute_checksum(line_68):
    s = 0
    for ch in line_68:
        if ch.isdigit(): s += int(ch)
        elif ch == '-': s -= 1
    return s % 10


def fetch(name):
    req = urllib.request.Request(MIRROR + name, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=90).read().decode('utf-8')


def parse_tle(text):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    sats = []
    name = None
    pending = []
    TLE1 = re.compile(r'^1 [0-9]{5,6}U')
    TLE2 = re.compile(r'^2 [0-9]{5,6} ')
    for line in lines:
        if TLE1.match(line) or TLE2.match(line):
            pending.append(line)
            if len(pending) == 2:
                t = pending[0].split()
                norad = int(re.match(r'\d+', t[1]).group())
                sats.append({'name': (name or pending[0]).strip(),
                             'norad': norad, 'l1': pending[0], 'l2': pending[1]})
                pending = []
        else:
            name = line
    return sats


def norm_l1(s):
    """Parse a caelo line-1 tolerantly; return normalized dict + epoch string.

    caelo TLEs use a dot-format mean motion derivative ('-.00000012') while
    bstar is always 'ddddd-e' (placeholder '00000+0' means zero drag).
    Some legacy entries carry real second-derivative values instead of
    the '00000-0' placeholder; those are ignored (written as 00000-0).
    """
    t = s['l1'].split()
    if not t or t[0] != '1':
        raise ValueError(f"not a line1: {s['l1']!r}")
    uidx = next((i for i, tok in enumerate(t) if 'U' in tok), None)
    if uidx is None:
        raise ValueError(f"no U-token: {s['l1']!r}")
    satnum = int(re.match(r'\d+', t[uidx]).group())
    launch = t[uidx + 1]
    # epoch: YYDDD.FFFFFFFF (e.g. 26279.12970005); fraction occupies chars 6-13
    epoch_tok = next((tok for tok in t[uidx + 2:] if re.fullmatch(r'\d{5}\.\d{7,8}', tok)), None)
    if epoch_tok is None:
        raise ValueError(f"no epoch: {s['l1']!r}")
    idx_epoch = t.index(epoch_tok)
    tail = t[idx_epoch + 1:]
    # ndot: dot-format (e.g. -.00000012 or .00000022), standard 5-exp format,
    # or an unsigned dot value; may carry a leading sign
    ndot_tok = next((tok for tok in tail if re.fullmatch(r'[+-]?\.\d+|[+-]\d{5}[+-]\d', tok)), None)
    if ndot_tok is None:
        raise ValueError(f"no ndot: {s['l1']!r}")
    ndot = float(ndot_tok)
    # bstar: NORAD format 0.dddddEexp (e.g. 00000+0 = 0; 46359-3 = 0.46359e-3)
    bstar_tok = next((tok for tok in reversed(tail)
                      if re.fullmatch(r'[+-]?\d{5}[+-]\d{1,2}$', tok)), None)
    if bstar_tok is None:
        raise ValueError(f"no bstar: {s['l1']!r}")
    m = re.fullmatch(r'([+-]?)(\d{5})([+-])(\d{1,2})', bstar_tok)
    mant = int(m.group(2)) / 100000.0
    exp = int(m.group(4)) if m.group(3) == '+' else -int(m.group(4))
    bstar = mant * (10 ** exp)
    if m.group(1) == '-':
        bstar = -bstar
    try:
        elm = int(t[-1])
    except Exception:
        raise ValueError(f"bad elm: {s['l1']!r}")
    return dict(satnum=satnum, launch=launch, epoch_str=epoch_tok,
                ndot=ndot, bstar=bstar, elm=elm)


def norm_l2(s):
    """Parse caelo line-2 by NORAD field positions (same slices as satellite.js)."""
    t = s['l2'].split()
    satnum = int(re.match(r'\d+', t[1]).group())
    l2 = s['l2']
    inc = float(l2[8:16])
    node = float(l2[17:25])
    ecc = float('0.' + l2[26:33])
    argp = float(l2[34:42])
    mo = float(l2[43:51])
    no = float(l2[52:63])
    revnum = int(l2[63:68].strip())
    return dict(satnum=satnum, inc=inc, node=node, argp=argp, mo=mo,
                ecc=ecc, no=no, revnum=revnum)


def build_tles(s):
    """Return (line1_69, line2_69) strict NORAD TLE lines for a parsed TLE.

    NORAD standard line 1 = 68 data columns + checksum (69 total):
      1{cat:5}U{y2:2}{num:3}{piece:3}{epochyr:2}{epoch:12}{ndot:10} 00000-0  {bstar:8} 0 {elset:4}
    NORAD standard line 2 = 68 data columns + checksum (69 total).
    """
    n1 = norm_l1(s); n2 = norm_l2(s)
    # caelo launch ID: YYNNNPP (e.g. 07052A) or YYNNNPPX (e.g. 23174AX)
    launch = n1['launch']
    y2 = int(launch[0:2])
    launchnum = int(launch[2:5])
    piece = launch[5:]
    # caelo epoch: YYDDD.FFFFFFFF -> NORAD: year@19-20, epoch day@21-32 (DDD.FFFFFFFF)
    epochyr = int(n1['epoch_str'][0:2])
    epoch = n1['epoch_str'][2:14]
    ndot_s = fmt_ndot(n1['ndot'])
    bstar_s = fmt_bstar(n1['bstar'])
    line1_68 = (f"1 {n1['satnum']:5d}U {y2:02d}{launchnum:03d}{piece:3s} "
                f"{epochyr:2d}{epoch:12s} {ndot_s:10s} "
                f"00000-0  {bstar_s:8s} 0 {n1['elm']:4d}")
    assert len(line1_68) == 68, (len(line1_68), repr(line1_68))
    line1 = line1_68 + str(compute_checksum(line1_68))
    ecc_s = f"{n2['ecc']:.6f}".replace('.', '')
    line2_68 = (f"2 {n2['satnum']:5d} "
                + f"{n2['inc']:.4f}".ljust(8) + " "
                + f"{n2['node']:.4f}".ljust(8) + " "
                + f"{ecc_s:7s}" + " "
                + f"{n2['argp']:.4f}".ljust(8) + " "
                + f"{n2['mo']:.4f}".ljust(8) + " "
                + f"{n2['no']:11.8f}"
                + f"{n2['revnum']:5d}")
    assert len(line2_68) == 68, (len(line2_68), repr(line2_68))
    line2 = line2_68 + str(compute_checksum(line2_68))
    assert compute_checksum(line1[:-1]) == int(line1[-1])
    assert compute_checksum(line2[:-1]) == int(line2[-1])
    return line1, line2


def main():
    print('RASSVET real-TLE fetch & format')
    glo_ops = parse_tle(fetch('glo-ops.tle'))
    active = parse_tle(fetch('active.tle'))
    catalog = parse_tle(fetch('catalog.tle'))
    print(f'  glo-ops: {len(glo_ops)} | active: {len(active)} | catalog: {len(catalog)}')

    seen = {}  # norad -> group

    def add(g, s):
        if s['norad'] in seen:
            return
        seen[s['norad']] = g

    for s in glo_ops:
        add('glonass', s)
    for s in active:
        if re.search(r'\[GLONASS', s['name']):
            add('glonass', s)

    geo_pat = re.compile(r'EXPRESS|YAMAL|LUCH|GEO-IK|MOLNIYA')
    for s in active:
        if geo_pat.search(s['name']):
            add('geo', s)
    for s in catalog:
        if geo_pat.search(s['name']):
            yr = int(s['l1'][18:20])
            if yr == 26:
                add('geo', s)

    rus_pat = re.compile(r'RESURS|METEOR|KANOPUS|LEO EXPRESS')
    for s in active:
        if rus_pat.search(s['name']):
            add('rusnet', s)
    decoys = set(range(2561, 2562)) | set(range(2588, 2596)) | set(range(2600, 2619))
    for s in active:
        m = re.match(r'COSMOS (\d+)', s['name'])
        if m and int(m.group(1)) in decoys and int(m.group(1)) not in seen:
            add('rusnet', s)

    print('\nRaw groups:')
    for g in ['glonass', 'geo', 'rusnet']:
        print(f'  {g}: {len([n for n in seen if seen[n] == g])}')

    outdir = 'data/tles/real'
    os.makedirs(outdir, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    refresh = '2026-10-06T21:01:53Z'
    header = [
        '# RASSVET - real Russian satellite TLEs (data collection pass)',
        '# Source: CelesTrak GP element sets via caelo-works/tle-mirror (snapshot every 8h):',
        '#   https://raw.githubusercontent.com/caelo-works/tle-mirror/main/tle/',
        '# Data:    © CelesTrak / Dr. T.S. Kelso',
        f'# Mirror refreshed: {refresh}  |  Retrieval: {now}',
        '',
        '@ GROUP=',
    ]

    groups_order = ['glonass', 'geo', 'rusnet']
    records = {}
    warnings = []
    for g in groups_order:
        rows = []
        for norad in seen:
            if seen[norad] != g:
                continue
            orig = None
            for src in (glo_ops, active, catalog):
                for s in src:
                    if s['norad'] == norad:
                        orig = s
                        break
                if orig:
                    break
            if not orig:
                continue
            try:
                line1, line2 = build_tles(orig)
            except Exception as e:
                import traceback
                warnings.append(f'{g} norad={norad} "{orig["name"]}" -> {type(e).__name__}: {e}\n{traceback.format_exc()}')
                continue
            rows.append((norad, orig['name'], line1, line2))
        rows.sort()
        records[g] = rows
        fh = open(os.path.join(outdir, g + '.txt'), 'w')
        for i, hline in enumerate(header):
            fh.write((hline.replace('@ GROUP=', f'@ GROUP={g}')) if i == 7 else hline + '\n')
        for norad, name, l1, l2 in rows:
            fh.write(f"{name}\n{l1}\n{l2}\n")
        fh.close()
        print(f'  written {outdir}/{g}.txt : {len(rows)} sats')

    total = sum(len(r) for r in records.values())
    print(f'\nTotal unique real Russian sats: {total}')
    if warnings:
        print(f'\nSkipped {len(warnings)} records (parse/format failure):')
        for w in warnings:
            print(f'  - {w}')
    else:
        print('\nNo records skipped.')
    h = {}
    for g in groups_order:
        h[g] = [{'norad': n, 'name': nm, 'tleLine1': l1, 'tleLine2': l2}
                for n, nm, l1, l2 in records[g]]
    with open('/tmp/real_tles.json', 'w') as f:
        json.dump(h, f, indent=1)
    print('  -> /tmp/real_tles.json')


if __name__ == '__main__':
    main()
