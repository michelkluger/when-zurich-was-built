# When Zürich Was Built

Every building standing in the city of Zürich, drawn as its real outline and coloured by the year it was finished, from the medieval old town to 2026.

<p align="center"><img src="media/preview.gif" width="360" alt="Animated map of Zürich's buildings appearing by year built, 1850 to 2026"></p>

**Live page:** https://michelkluger.github.io/when-zurich-was-built/

Of the 45,646 buildings matched, 12,059 date from 1919–1945, more than any other era, and the busiest single year on the map is 1931. Since 2011 new buildings average 5.1 floors, the highest of any era since the 1850–1918 city blocks (5.4).

The page has a timeline you can play or scrub, a switch that raises every building by its floor count, an era filter and a five-stop tour of the old town, the 1850–1918 blocks, the post-war estates, Zürich-West and Hirzenbach.

## Why the city grew this way

The map shows five stages: a walled core, dense blocks, outward estates, a slowdown, then growth upward. The tour and video captions explain each one with this history:

- **Core:** the city decided in 1833 to remove its fortifications, which came down by 1842 and freed land around the old town ([HLS](https://hls-dhs-dss.ch/articles/003115)).
- **Blocks, 1850–1918:** the Zürich–Baden railway opened in 1847 and industry grew up in Aussersihl. In 1893 the city absorbed eleven fast-growing, near-bankrupt workers' suburbs, and closed city blocks followed ([HLS](https://hls-dhs-dss.ch/de/articles/003127), [Stadtarchiv](https://www.zop.zb.uzh.ch/bitstream/123456789/4412/1/Stadtarchiv_Zweite_Eingemeindung_1994.pdf)).
- **Out, 1920s–1950s:** after World War I a housing shortage led to about 30,000 new flats in 1918–1934, more than 40% publicly supported, mostly built by cooperatives with city loans and land ([Koch](https://db-thueringen.de/servlets/MCRFileNodeServlet/dbt_derivate_00042515/Michael_Koch_pdfa.pdf), [ZB Zürich](https://www.zb.uzh.ch/en/fokus/beitrag/money-makes-the-world-go-round)). In 1934 eight villages joined the city, and Schwamendingen was planned in 1948 as a garden city for workers at the Oerlikon factories ([Stadt Zürich](https://www.stadt-zuerich.ch/schwamendingen), [ISOS](https://api.isos.bak.admin.ch/ob/5800/doc/ISOS_5800_Schwamendingen.pdf)).
- **Slowdown:** the city's population peaked at 440,180 in 1962 and then fell as rising incomes, cheap energy and cars pushed growth out to the suburbs. 1990 was the first year it grew again ([Stadt Zürich](https://www.stadt-zuerich.ch/de/stadtleben/stadtportraet/zuerichs-geschichte/digitale-zeitreise/wachstum.html), [HLS](https://hls-dhs-dss.ch/de/articles/007876/)).
- **Up:** the old industrial land of Zentrum Zürich Nord in Oerlikon was built on from 1998, and Zürich-West was replanned in 1998/99 ([ABB](https://new.abb.com/news/detail/124778/abb-completes-sale-of-key-urban-development-plot-to-the-city-of-zurich), [Zurich West](https://en.wikipedia.org/wiki/Zurich_West)). The 1999 zoning plan and the 2001 high-rise guidelines set where towers may go ([Stadt Zürich](https://www.stadt-zuerich.ch/de/planen-und-bauen/stadtplanung/bau-zonenordnung/hochhaus.html)). Since 1 May 2014 the revised federal Spatial Planning Act requires growth inward ([Kanton Zürich](https://www.zh.ch/bin/zhweb/publish/regierungsratsbeschluss-unterlagen./2013/1083/5027_Strategie_innere_Verdichtung.pdf)).

## How it works

1. `scripts/download.sh` fetches the public GWR extract for Canton Zürich (Federal Statistical Office) and, through the Overpass API, the OpenStreetMap building outlines and map context (water, roads, rail, neighbourhood names, city boundary).
2. `scripts/prep_city.js` converts the outlines to Swiss LV95 coordinates, gives each outline the year built and floors of the register entries inside it (the largest entry sets the year), and writes `docs/city.txt` (packed binary, base64) and `docs/city_ctx.json`.
3. `docs/index.html` is the interactive page (deck.gl from a CDN, no build step).
4. `scripts/export.py` + `scripts/encode.py` render the 30-second video card (`src/video.html`) frame by frame with Playwright and encode a 1080×1350 MP4 (4:5, for social feeds) and the GIF above.

```sh
sh scripts/download.sh
node scripts/prep_city.js data/gebaeude_batiment_edificio.csv data/osm_buildings.json data/osm_context.json docs

# optional: video export (Edge with GPU WebGL via Direct3D, so Windows; GL=swiftshader for software rendering, ~45x slower;
# PW_CHANNEL=chrome or "" for bundled Chromium)
for k in 0 1 2 3; do uv run --with playwright python scripts/export.py frames $k 4 & done; wait
uv run --with imageio-ffmpeg python scripts/encode.py frames out/when-zurich-was-built
```

`scripts/prep_gwr.js` packs the register for the whole canton. It was used for early sketches and isn't needed for the page.

## Caveats

- Only buildings standing today. A demolished building has no outline, so each site shows only what stands there now, and older eras look smaller than they were.
- 4,469 OSM outlines (9%) had no register entry inside them or within 3 m and are left out.
- Floors are today's count. In the 3D view a building is floors × 3.2 m tall; the video exaggerates heights 5× so they read at city scale.
- Coordinates are converted with swisstopo's approximate formulas (about 1 m accuracy).

## Data

- Federal Register of Buildings and Dwellings (GWR): [public extract](https://www.housing-stat.ch/) for Canton Zürich, Federal Statistical Office, exported 3 November 2026.
- Building outlines and map context: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL. `docs/city.txt` and `docs/city_ctx.json` are derived from OSM and are shared under the ODbL.

Code is MIT licensed. Data remains under its providers' terms.
