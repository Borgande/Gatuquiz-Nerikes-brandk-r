#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Hämtar gatudata från Overpass och skriver en förgenererad fil per station.

    python tools/build-streets.py              # alla stationer
    python tools/build-streets.py orebro kumla # bara valda

Kör om när gatunätet har ändrats. Utdata läses av index.html vid start,
vilket gör appen oberoende av att Overpass svarar.
"""
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
]
# Korbara vagar. *_link ar pa- och avfarter - utan dem saknas delar av
# gator som Nygatan i Orebro. pedestrian ar gagator och torg, som en
# raddningstjanst behover kunna och som far kora dar.
HIGHWAY = ('motorway|trunk|primary|secondary|tertiary|unclassified'
           '|residential|service|living_street|road|pedestrian'
           '|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link')

# Hamtas ocksa, men behalls BARA om namnet redan finns bland typerna ovan.
# Sa blir t.ex. Norra Skyttegatans cykelvagsdel komplett utan att rena
# cykelvagar blir egna svar i quizet.
KOMPLETTERANDE = 'cycleway'

# Aldrig med: construction ar vagar under byggnation, resten ar inte korbara.
UTESLUTNA = ('construction', 'footway', 'path', 'steps', 'bridleway')

# Matargator = genomfartsnatet. Vald tillsammans med anvandaren efter att natet
# ritats upp pa kartan: dessa klasser bildar ett sammanhangande nat, medan
# unclassified bara ger losryckta stumpar i industriomraden och utkanter.
# Byts definitionen har maste datan regenereras.
MATARKLASSER = ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')
DECIMALS = 5  # ~1 m upplösning; halverar filstorleken mot full precision
# Overpass svarar 406 på anrop utan riktig User-Agent och ber uttryckligen om
# att klienten identifierar sig.
USER_AGENT = 'Gatuprov-byggverktyg/1.0 (+https://github.com/borgande/Gatuquiz-Nerikes-brandk-r)'


def fetch(bbox):
    query = ('[out:json][timeout:90];way["highway"~"^(%s|%s)$"]["name"]%s;'
             'out body geom;' % (HIGHWAY, KOMPLETTERANDE, bbox))
    qs = urllib.parse.urlencode({'data': query})
    last = None
    for attempt in range(3):
        for mirror in MIRRORS:
            try:
                print('    provar %s' % mirror)
                # GET, inte POST: speglarna svarar 504 på POST men 200 på GET.
                req = urllib.request.Request(mirror + '?' + qs, headers={
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json',
                })
                with urllib.request.urlopen(req, timeout=180) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as exc:
                last = exc
                # 429/504 = Overpass är upptagen. Vänta ut slotkön i stället
                # för att hamra vidare — annars blir vi blockerade längre.
                wait = 60 if exc.code in (429, 504) else 5
                print('    misslyckades: HTTP %s — väntar %ds' % (exc.code, wait))
                time.sleep(wait)
            except Exception as exc:
                last = exc
                print('    misslyckades: %s' % exc)
                time.sleep(5)
    raise SystemExit('  Alla speglar misslyckades. Senaste fel: %s' % last)


KLUSTERGRANS_M = 300.0  # gap storre an sa = olika gator med samma namn


def _meter(a, b):
    """Grovt avstand i meter mellan tva [lat, lon]."""
    dlat = (a[0] - b[0]) * 111320.0
    dlon = (a[1] - b[1]) * 111320.0 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlon)


def klustra(segs):
    """Vilken forekomst varje segment tillhor.

    Gatunamn som Skolvagen finns i varenda by. Utan uppdelning slas de ihop
    till ett objekt, och da kan hela klumpen hamna i ett omrade tva mil bort.
    Union-find: tva segment hor ihop om nagon andpunkt ligger inom
    KLUSTERGRANS_M fran den andras.
    """
    n = len(segs)
    forald = list(range(n))

    def hitta(x):
        while forald[x] != x:
            forald[x] = forald[forald[x]]
            x = forald[x]
        return x

    andar = [[s[0], s[-1]] for s in segs]
    for i in range(n):
        for j in range(i + 1, n):
            if hitta(i) == hitta(j):
                continue
            if any(_meter(p, q) <= KLUSTERGRANS_M for p in andar[i] for q in andar[j]):
                forald[hitta(i)] = hitta(j)

    # Numrera om till 0,1,2… i segmentordning
    nummer, ut = {}, []
    for i in range(n):
        r = hitta(i)
        if r not in nummer:
            nummer[r] = len(nummer)
        ut.append(nummer[r])
    return ut


def to_app_format(data):
    """{gatunamn: [[[lat,lon],...], ...]} — samma form som addStreet() vill ha."""
    streets = {}
    roundabouts = {}
    typer = {}
    matar = set()
    for way in data.get('elements', []):
        tags = way.get('tags') or {}
        name = tags.get('name')
        geom = way.get('geometry')
        hw = tags.get('highway')
        if not name or not geom or hw in UTESLUTNA:
            continue
        seg = [[round(p['lat'], DECIMALS), round(p['lon'], DECIMALS)] for p in geom]
        if len(seg) >= 2:
            streets.setdefault(name, []).append(seg)
            typer.setdefault(name, set()).add(hw)
            # En gata raknas som matargata om NAGON av dess delar ar det;
            # en genomfartsled kan ha korta partier klassade lagre.
            if hw in MATARKLASSER:
                matar.add(name)
            # Parallell lista med segmentens rondellflaggor – appen ritar
            # rondeller överst så de inte göms under korsande gator.
            roundabouts.setdefault(name, []).append(tags.get('junction') == 'roundabout')

    # Rena cykelvagar blir inte egna svar. Har gatan aven en korbar del far
    # cykelvagsdelen folja med, sa att t.ex. Norra Skyttegatan blir komplett.
    enbart_cykel = [n for n, t in typer.items() if t == {KOMPLETTERANDE}]
    for n in enbart_cykel:
        streets.pop(n, None)
        roundabouts.pop(n, None)

    # Ta bara med gator som faktiskt har en rondell, filen blir annars onödigt stor.
    roundabouts = {k: v for k, v in roundabouts.items() if any(v)}

    # Bara gator som faktiskt delas upp behover fältet.
    clusters = {}
    for namn, segs in streets.items():
        if len(segs) < 2:
            continue
        ids = klustra(segs)
        if max(ids) > 0:
            clusters[namn] = ids

    # Bara namn som overlevde cykelvagsfiltret ovan
    matargator = sorted(n for n in matar if n in streets)

    return streets, roundabouts, clusters, matargator


def main():
    with io.open(os.path.join(ROOT, 'tenants.json'), encoding='utf-8') as fh:
        tenants = json.load(fh)

    wanted = set(sys.argv[1:])
    todo = [(org, st, src)
            for org in tenants['orgs']
            for st in org['stations']
            for src in st['sources']
            if not wanted or src['id'] in wanted or st['id'] in wanted]
    if not todo:
        raise SystemExit('Inga datakällor matchade: %s' % ', '.join(sorted(wanted)))

    done = 0
    for org, station, source in todo:
        out_path = os.path.join(ROOT, source['streetsUrl'].replace('/', os.sep))
        print('%s / %s / %s' % (org['label'], station['label'], source['label']))

        if os.path.exists(out_path) and not wanted:
            print('    finns redan, hoppar över (ange id för att tvinga om)')
            continue
        if done:
            print('    pausar 20s (Overpass rate limit)')
            time.sleep(20)

        streets, roundabouts, clusters, matargator = to_app_format(fetch(source['bbox']))
        done += 1
        if not streets:
            print('    VARNING: inga gator, hoppar över skrivning')
            continue

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        payload = {
            'org': org['id'],
            'station': station['id'],
            'source': source['id'],
            'bbox': source['bbox'],
            'generated': time.strftime('%Y-%m-%d'),
            'count': len(streets),
            'streets': streets,
            'roundabouts': roundabouts,
            'clusters': clusters,
            'matargator': matargator,
        }
        with io.open(out_path, 'w', encoding='utf-8', newline='') as fh:
            fh.write(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
        size = os.path.getsize(out_path) / 1024.0
        print('    %d gator -> %s (%.0f kB)' % (len(streets), source['streetsUrl'], size))


if __name__ == '__main__':
    main()
