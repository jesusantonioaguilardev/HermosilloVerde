#!/usr/bin/env python3
"""
Extrae los 661 polígonos reales de Hermosillo del mapa de referencia
y genera GeoJSON
"""

import json
import re
import sys
from pathlib import Path

try:
    import requests
    response = requests.get('https://www.luisarmandomoreno.com/wp-content/uploads/2021/07/hmocolonias.html', timeout=30)
    html = response.text
except:
    print("❌ Error: No se pudo descargar la página.")
    sys.exit(1)

# Buscar el JSON embebido
start_idx = html.find('{"x"')
if start_idx == -1:
    print("❌ Error: No se encontró JSON")
    sys.exit(1)

# Encontrar el final del JSON
brace_count = 0
end_idx = start_idx
in_string = False
escape_next = False

for i in range(start_idx, len(html)):
    char = html[i]
    
    if escape_next:
        escape_next = False
        continue
    
    if char == '\\':
        escape_next = True
        continue
    
    if char == '"' and not escape_next:
        in_string = not in_string
        continue
    
    if in_string:
        continue
    
    if char == '{':
        brace_count += 1
    elif char == '}':
        brace_count -= 1
        if brace_count == 0:
            end_idx = i + 1
            break

json_str = html[start_idx:end_idx]

try:
    data = json.loads(json_str)
except json.JSONDecodeError as e:
    print(f"❌ Error JSON: {e}")
    sys.exit(1)

# Encontrar addPolygons
polygons_call = None
for call in data.get('x', {}).get('calls', []):
    if call.get('method') == 'addPolygons':
        polygons_call = call
        break

if not polygons_call:
    print("❌ No se encontraron polígonos")
    sys.exit(1)

polygons_array = polygons_call.get('args', [[]])[0]
print(f"✓ Encontrados {len(polygons_array)} polígonos (datos a procesar)")

# DEBUG: Inspeccionar estructura del primer polígono
if polygons_array:
    print(f"DEBUG - Estructura del primer polígono:")
    first_poly = polygons_array[0]
    print(f"  - Tipo: {type(first_poly)}")
    if isinstance(first_poly, list):
        print(f"  - Longitud: {len(first_poly)}")
        if len(first_poly) > 0:
            print(f"  - Primer elemento tipo: {type(first_poly[0])}")
            if isinstance(first_poly[0], dict):
                print(f"  - Claves: {list(first_poly[0].keys())}")

features = []

for idx, polygon in enumerate(polygons_array[:10]):  # Solo primeros 10 para debug
    try:
        if isinstance(polygon, list) and len(polygon) > 0:
            ring = polygon[0]
            
            if isinstance(ring, dict):
                keys = list(ring.keys())
                print(f"  Polígono {idx}: keys={keys}")
                
                if 'lng' in ring and 'lat' in ring:
                    lngs = ring['lng']
                    lats = ring['lat']
                    print(f"    ✓ Tiene lng ({len(lngs)} items) y lat ({len(lats)} items)")
                    
                    if isinstance(lngs, list) and isinstance(lats, list) and len(lngs) == len(lats) and len(lngs) > 2:
                        coordinates = []
                        for i in range(len(lngs)):
                            coordinates.append([float(lngs[i]), float(lats[i])])
                        
                        if coordinates[0] != coordinates[-1]:
                            coordinates.append(coordinates[0])
                        
                        features.append({
                            "type": "Feature",
                            "properties": {
                                "CVE_AGEB": f"260010001{str(idx + 1).zfill(5)}",
                                "NOMBRE_LOC": f"Sector {idx + 1}",
                                "id": idx + 1
                            },
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [coordinates]
                            }
                        })
                        print(f"    ✓ Polígono procesado")
                else:
                    print(f"    ✗ No tiene lng/lat, tiene: {keys}")
    except Exception as e:
        print(f"  Error polígono {idx}: {e}")

print(f"\n✓ Procesados {len(features)} polígonos exitosos")
