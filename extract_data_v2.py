#!/usr/bin/env python3
import json
import sys
from pathlib import Path

try:
    import requests
    response = requests.get('https://www.luisarmandomoreno.com/wp-content/uploads/2021/07/hmocolonias.html', timeout=30)
    html = response.text
except Exception as e:
    print(f"❌ Error descargando: {e}")
    sys.exit(1)

# Extraer JSON
start_idx = html.find('{"x"')
if start_idx == -1:
    print("❌ No encontrado JSON")
    sys.exit(1)

# Contar llaves
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
except Exception as e:
    print(f"❌ Error JSON: {e}")
    sys.exit(1)

# Encontrar polígonos
polygons_call = None
for call in data.get('x', {}).get('calls', []):
    if call.get('method') == 'addPolygons':
        polygons_call = call
        break

if not polygons_call:
    print("❌ No addPolygons")
    sys.exit(1)

polygons_array = polygons_call.get('args', [[]])[0]
print(f"✓ Encontrados {len(polygons_array)} polígonos")

# Inspeccionar estructura
first = polygons_array[0]
print(f"\nEstructura del primer polígono:")
print(f"  Type: {type(first)} -> {type(first[0])} -> {type(first[0][0]) if first[0] else 'None'}")

# Intentar acceder
if first and first[0] and first[0][0]:
    elem = first[0][0]
    if isinstance(elem, dict):
        print(f"  Dict keys: {list(elem.keys())[:10]}")
        # Mostrar tipos
        for key in list(elem.keys())[:3]:
            val = elem[key]
            if isinstance(val, list):
                print(f"    {key}: [{len(val)} items] {type(val[0]).__name__}")
            else:
                print(f"    {key}: {type(val).__name__}")

# Construir GeoJSON
features = []

for idx, polygon in enumerate(polygons_array):
    try:
        if polygon and polygon[0]:
            # La estructura es: polygon[0] = lista de "rings"
            # Cada ring es una lista de puntos [lng, lat]
            ring_list = polygon[0]
            
            if isinstance(ring_list, list) and len(ring_list) > 0:
                # Obtener el primer ring (exterior)
                first_ring = ring_list[0]
                
                if isinstance(first_ring, dict) and 'lng' in first_ring and 'lat' in first_ring:
                    lngs = first_ring['lng']
                    lats = first_ring['lat']
                    
                    if isinstance(lngs, list) and isinstance(lats, list) and len(lngs) == len(lats) and len(lngs) > 2:
                        coordinates = []
                        for i in range(len(lngs)):
                            coordinates.append([float(lngs[i]), float(lats[i])])
                        
                        # Cerrar
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
                elif isinstance(first_ring, list):
                    # Podría ser directamente array de coordenadas [lng, lat]
                    coordinates = []
                    for point in first_ring:
                        if isinstance(point, (list, tuple)) and len(point) >= 2:
                            coordinates.append([float(point[0]), float(point[1])])
                    
                    if len(coordinates) > 2:
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
    except Exception as e:
        if idx < 5:
            print(f"Error {idx}: {e}")

print(f"\n✓ Procesados {len(features)} polígonos")

if len(features) > 0:
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    Path('data').mkdir(exist_ok=True)
    output_path = Path('data/hermosillo_colonias_real.geojson')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False)
    
    file_size = output_path.stat().st_size / 1024
    print(f"\n✅ Guardadas {len(features)} colonias en data/hermosillo_colonias_real.geojson ({file_size:.1f} KB)")
else:
    print("❌ No se pudieron procesar los polígonos")
    sys.exit(1)
