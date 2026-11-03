#!/bin/sh
# Fetches the inputs into data/: the GWR extract for Canton Zürich and the OSM outlines + context for the city.
set -e
cd "$(dirname "$0")/.."
mkdir -p data
curl -L -C - --retry 5 --retry-all-errors -o data/zh.zip https://public.madd.bfs.admin.ch/zh.zip
unzip -o -j data/zh.zip gebaeude_batiment_edificio.csv -d data
curl -sS --retry 3 --data-urlencode data@scripts/overpass_buildings.txt https://overpass-api.de/api/interpreter -o data/osm_buildings.json
curl -sS --retry 3 --data-urlencode data@scripts/overpass_context.txt https://overpass-api.de/api/interpreter -o data/osm_context.json
