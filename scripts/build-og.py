#!/usr/bin/env python3
"""Build public/og.png: the 1200×630 PNG shown in link previews (Facebook, WhatsApp, X…), served by Cloudflare before
the Worker, its fingerprint and its text in src/web/og.json. Facebook ignores SVG, hence a PNG.

And one picture per section of the site (RUBRIQUES), so that a link to the hikes and a link to the events do not look
the same. Those go to public/og/, served by Cloudflare beside the Worker like the press visuals, named after their
content; src/web/og-rubriques.json says which pages show which.

And for each section a 4:5 picture (1080×1350, `<key>-4x5.<hash>.png`, `png_4x5` in the manifest) for the posts on
Instagram, and one of the share picture (`png_4x5` in src/web/og.json): the texts above the map. No page links them in
its meta tags.

All are marketing's track A (identite/og/gen.py, chosen by the user on 04/11/2026): the night gradient of the site's
band, the lockup alone (public/logo/, no page address), the section's name with « 974 » in Bricolage Grotesque
(public/font/titres-1.woff2), its line, and the real map drawn as contour lines every 100 m, from the IGN's altitudes
(RGE ALTI, Licence Ouverte 2.0, scripts/build-courbes.py, committed in scripts/og/): the whole island, bleeding off the
right edge of a 1200×630, or the Piton de la Fournaise close up for the volcano. Vigilance and cyclones say
Météo-France's sentence (kit.md, « Vigilance et cyclone »). Texts in Inter (scripts/og/inter.woff2, SIL Open Font
License 1.1).
Each page is an HTML page shot by headless Chrome, then cut to the exact size and saved on a palette of 256 colours,
dithered, by libvips: a third of the size, the gradient unchanged to the eye. A 1200×630 over 300 KB, or a 4:5 over 320 KB, stops the build. A
title or a line too long for its column is set smaller, never cut, and a line breaks only where written (« | »).
Needs libvips (`vips`, Ubuntu package libvips-tools).
Usage: python3 -I scripts/build-og.py
  Chrome is $CHROME, else Playwright's Chromium.
"""
import hashlib
import json
import os
import subprocess
import tempfile
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
# The 4:5 picture of a post on Instagram.
W45, H45 = 1080, 1350
CHROME = os.environ.get("CHROME") or str(Path.home() / ".cache/ms-playwright/chromium-1140/chrome-linux/chrome")
# The kit's texts (marketing: identite/kit.md).
THEMES = "Sorties · randos · météo · routes"
# Météo-France's sentence, word for word, on the vigilance's and the cyclones' pictures (kit.md).
MF_VIGILANCE = "Consulter le site officiel de Météo-France|vigilance.meteofrance.fr"
MF_CYCLONE = "Consulter le site officiel de Météo-France|meteofrance.re/fr/cyclone"

# Key, name (« | » breaks the line), line, and the pages (with the pages under them) that show the picture.
RUBRIQUES = [
    ("meteo", "Météo 974", "Mesurée aux stations,|en direct", ["/meteo"]),
    ("vigilance", "Vigilance 974", "Vigilance de Météo-France,|zone par zone", ["/vigilance"]),
    ("randonnee", "Rando 974", "Sentiers ouverts ou fermés,|traces GPS", ["/randonnees", "/sentiers"]),
    ("evenements", "Sorties 974", "Que faire ce week-end ?", ["/evenements"]),
    ("actualites", "Actu 974", "L'actu de l'île,|commune par commune", ["/actualites"]),
    ("volcan", "Volcan 974", "Piton de la Fournaise|en direct", ["/volcan"]),
    ("mer", "Mer 974", "La mer est à combien ?", ["/mer"]),
    ("bus", "Bus 974", "Prochain bus à votre arrêt", ["/bus"]),
    ("eau", "Eau 974", "Coupures, qualité,|restrictions", ["/eau", "/coupures-eau", "/secheresse"]),
    ("trafic", "Routes 974", "Routes fermées|et déviations", ["/trafic"]),
    ("historique", "Historique 974", "Le temps qu'il a fait|depuis 1900", ["/historique"]),
    ("energie", "Énergie 974", "Recharge et électricité|en direct", ["/bornes", "/electricite"]),
    ("velos", "Vélos 974", "Vélos et places libres,|en direct", ["/velos"]),
    ("air", "Air 974", "Qualité de l'air,|commune par commune", ["/air"]),
    ("communes", "Communes 974", "Votre commune en direct", ["/communes"]),
    ("defibrillateurs", "Défibrillateurs 974", "Le plus proche de vous|et ses horaires", ["/defibrillateurs"]),
    ("calendrier", "Calendrier 974", "Vacances scolaires|et jours fériés", ["/calendrier"]),
    ("cyclones", "Cyclones 974", "Systèmes actifs et alerte|en direct", ["/cyclones"]),
    ("crues", "Crues 974", "Rivières et vigilance crues", ["/crues"]),
    ("sport", "Sport 974", "Matchs, résultats,|Grand Raid", ["/sport"]),
    ("carburants", "Carburants 974", "Les prix maximum du mois", ["/carburants"]),
    ("feux", "Feux 974", "Les feux de végétation|vus par satellite, 24 h", ["/feux"]),
    ("enfants", "Enfants 974", "Où aller avec les enfants,|de 0 à 17 ans", ["/enfants"]),
    ("associations", "Espace clubs|et associations", "Proposer un événement,|en 2\u00a0minutes.|Gratuit, sans compte.", ["/associations"]),
]
# The volcano's third line, the kit's; the others have two levels.
INFO = {"volcan": "Niveau d'alerte, accès à l'Enclos, séismes"}
MF = {"vigilance": MF_VIGILANCE, "cyclones": MF_CYCLONE}
# The map's box: the island bleeds off the right edge; the Fournaise fills the right side, faded on the left under the
# text column (x 72 → 672).
BOX = {"ile": "left:696px;top:-10px;width:720px;height:645px",
       "fournaise": "left:470px;top:-60px;width:900px;height:724px;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 22%)"}
# In 4:5 the map below the texts: the island whole, from y 540 to y 1328; the Fournaise fills the bottom, faded at the
# top under the texts.
BOX45 = {"ile": "left:100px;top:540px;width:880px;height:788px",
         "fournaise": "left:-90px;top:470px;width:1260px;height:1013px;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 18%)"}
ZONE_ALT = {"ile": "courbes de niveau de l'île", "fournaise": "courbes de niveau du Piton de la Fournaise"}
LIMIT = 300 * 1024
LIMIT45 = 320 * 1024
OUT = ROOT / "public/og"


def assets(tmp):
    """The fonts and the lockup, as files beside the pages."""
    files = {
        "bricolage.woff2": (ROOT / "public/font/titres-1.woff2").read_bytes(),
        "inter.woff2": (ROOT / "scripts/og/inter.woff2").read_bytes(),
        "lockup.svg": next((ROOT / "public/logo").glob("logo-lockup-nuit.*.svg")).read_bytes(),
    }
    for name, data in files.items():
        (Path(tmp) / name).write_bytes(data)


def lines(text):
    return "<br>".join(escape(t) for t in text.split("|"))


def courbes(zone, tall):
    """The zone's contour lines (scripts/build-courbes.py), in the picture, in the kit's lagoon colour."""
    svg = (ROOT / f"scripts/og/courbes-{zone}.svg").read_text().strip()
    box = (BOX45 if tall else BOX)[zone]
    return svg.replace("<svg ", f'<svg class="abs" style="{box};color:#4fd1c5" preserveAspectRatio="xMidYMid meet" ', 1)


def titre(name):
    """« Météo 974 »: the number in the accent colour; a name without one (« Espace clubs|et associations ») as written."""
    if "974" not in name:
        return lines(name)
    head, tail = name.split("974", 1)
    return f'{lines(head)}<span class="n">974</span>{lines(tail)}'


def page(zone, name, line, size, top, extra="", mf="", italic=False, tall=False):
    """Track A (marketing, identite/og/gen.py): the map, the lockup alone, then the name, its line and the third line.
    Météo-France's sentence is at the bottom left; in 4:5 the map takes the bottom, the sentence goes under the line,
    and the texts have a column of 936 px instead of 600."""
    w, h, col = (W45, H45, 936) if tall else (W, H, 600)
    info = f'<div class="info fit" data-max="{col}" style="font-size:28px;margin-top:18px">{escape(extra)}</div>' if extra else ""
    note = ""
    if mf and tall:
        info += f'<div class="info" style="font-size:28px;line-height:1.25;margin-top:22px">{lines(mf)}</div>'
    elif mf:
        note = f'<div class="abs info" style="left:72px;bottom:44px;font-size:24px;line-height:1.25">{lines(mf)}</div>'
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face {{ font-family: "Bricolage"; src: url("bricolage.woff2") format("woff2"); font-weight: 600 800; }}
@font-face {{ font-family: "Inter"; src: url("inter.woff2") format("woff2"); font-weight: 400 800; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: {w}px; height: {h}px; overflow: hidden; }}
body {{ background: linear-gradient(160deg, #0b1f36 0%, #15406b 100%); color: #f1f5f9; font: 500 26px/1.3 "Inter", sans-serif;
  -webkit-font-smoothing: antialiased; position: relative; }}
.abs {{ position: absolute; }}
.titre {{ font-family: "Bricolage", sans-serif; font-weight: 800; line-height: .94; letter-spacing: -.035em; }}
.n {{ color: #ffcf1f; }}
.slogan {{ font-family: "Bricolage", sans-serif; font-weight: 700; color: #ffcf1f; letter-spacing: -.01em; line-height: 1.08; }}
.info {{ color: #b4c6d8; font-weight: 600; }}
.fit {{ white-space: nowrap; width: max-content; }}
</style></head><body>
{courbes(zone, tall)}<img class="abs" src="lockup.svg" style="left:60px;top:52px;height:76px" alt="">
<div class="abs" style="left:72px;top:{top}px">
<div class="titre fit" data-max="{col}" style="font-size:{size}px">{titre(name)}</div>
<div class="slogan fit" data-max="{col}" style="font-size:44px;margin-top:26px;font-style:{"italic" if italic else "normal"}">{lines(line)}</div>{info}
</div>{note}
<script>
// A title or a line wider than its column (data-max) set smaller until it fits: never cut, never wrapped.
document.fonts.ready.then(() => {{
  for (const e of document.querySelectorAll(".fit")) {{
    let size = parseFloat(getComputedStyle(e).fontSize);
    while (e.scrollWidth > Number(e.dataset.max) && size > 10) e.style.fontSize = `${{--size}}px`;
  }}
}});
</script></body></html>'''


def partage(tall=False):
    slogan = json.loads((ROOT / "src/web/brand.json").read_text())["slogan"]
    return page("ile", "La Réunion 974|en direct", slogan, 108, 196, THEMES, italic=True, tall=tall)


def rubrique(key, name, line, tall=False):
    rows = name.count("|") + line.count("|") + 2
    # « Espace clubs|et associations » and its three lines: 100 px, higher up; in 4:5 every block starts at 196.
    size, top = (128, 196) if rows <= 3 else (100, 160)
    if key in MF:
        top = 180
    return page("fournaise" if key == "volcan" else "ile", name, line, size, 196 if tall else top, INFO.get(key, ""), MF.get(key, ""), tall=tall)


def alt(key, name, line):
    """What the picture shows, in sentences (marketing): the map and its source, then the texts as written."""
    said = lambda t: t.replace("|", " ")
    text = f"Symbole rundata.re et {ZONE_ALT['fournaise' if key == 'volcan' else 'ile']} (altitudes IGN RGE ALTI)\u00a0: {said(name)}. {said(line)}"
    if key in INFO:
        text += f". {INFO[key]}"
    if key in MF:
        a, b = MF[key].split("|")
        text += f". {a}\u00a0: {b}"
    return text


def shoot(tmp, name, html, w=W, h=H):
    src, raw, png = Path(tmp) / f"{name}.html", Path(tmp) / f"{name}-brut.png", Path(tmp) / f"{name}.png"
    src.write_text(html)
    # The window is taller than the picture: headless Chrome takes its own bar out of the window's height.
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    f"--user-data-dir={Path(tmp) / 'profil'}", f"--window-size={w},{h + 200}", "--virtual-time-budget=5000",
                    f"--screenshot={raw}", src.as_uri()], check=True, capture_output=True)
    subprocess.run(["vips", "crop", str(raw), f"{png}[palette,Q=100,dither=1,effort=10,strip]", "0", "0", str(w), str(h)], check=True)
    data = png.read_bytes()
    # A preview fetched by a messaging app on a phone: 300 KB at most (data-run, 04/11/2026); an Instagram post, 320 KB.
    limit = LIMIT45 if (w, h) == (W45, H45) else LIMIT
    if len(data) > limit:
        raise SystemExit(f"{name}: {len(data) // 1024} KB, over {limit // 1024} KB")
    return data


def save(data, key):
    """The picture under a name of its content: a new picture is a new address, which Facebook and the others fetch
    again instead of showing the one they keep."""
    name = f"{key}.{hashlib.sha256(data).hexdigest()[:10]}.png"
    (OUT / name).write_bytes(data)
    print(OUT / name, f"{len(data) // 1024} KB PNG")
    return f"/og/{name}"


def main():
    with tempfile.TemporaryDirectory() as tmp:
        assets(tmp)
        OUT.mkdir(parents=True, exist_ok=True)
        for old in OUT.iterdir():
            old.unlink()
        manifest = []
        for key, name, line, pages in RUBRIQUES:
            png = save(shoot(tmp, key, rubrique(key, name, line)), key)
            png_4x5 = save(shoot(tmp, f"{key}-4x5", rubrique(key, name, line, tall=True), W45, H45), f"{key}-4x5")
            manifest.append({"pages": pages, "png": png, "png_4x5": png_4x5, "alt": alt(key, name, line)})
        (ROOT / "src/web/og-rubriques.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
        data = shoot(tmp, "og", partage())
        png_4x5 = save(shoot(tmp, "accueil-4x5", partage(tall=True), W45, H45), "accueil-4x5")
        # /og.png keeps its name, linked with its fingerprint (?v=).
        (ROOT / "public/og.png").write_bytes(data)
        slogan = json.loads((ROOT / "src/web/brand.json").read_text())["slogan"]
        said = f"Symbole rundata.re et {ZONE_ALT['ile']} (altitudes IGN RGE ALTI)\u00a0: La Réunion 974 en direct. {slogan}. {THEMES}"
        (ROOT / "src/web/og.json").write_text(json.dumps({"v": hashlib.sha256(data).hexdigest()[:8], "png_4x5": png_4x5, "alt": said}, ensure_ascii=False))
        print(ROOT / "public/og.png", f"{len(data) // 1024} KB PNG")


if __name__ == "__main__":
    main()
