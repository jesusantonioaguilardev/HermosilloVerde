#!/usr/bin/env python3
"""
Genera nombres REALISTAS para todos los 661 AGEBs de Hermosillo
Agrupa por colonias principales y agrega sub-denominaciones
"""

import json
from pathlib import Path

# Colonias principales como centros de agrupación
COLONIAS_PRINCIPALES = {
    "Centro": (29.0955, -110.9640),
    "San Benito": (29.0887, -110.9543),
    "Pitic": (29.0810, -110.9540),
    "Vertiente": (29.0778, -110.9745),
    "La Matanza": (29.0745, -110.9650),
    "Granjeno": (29.0710, -110.9740),
    "Pedregal": (29.0700, -110.9450),
    "Infonavit": (29.0580, -110.9420),
    "Ley 57": (29.0630, -110.9820),
    "Villas del Seris": (29.0420, -110.9610),
    "Bugambilias": (29.0480, -110.9300),
    "Costa Rica": (29.0815, -110.8900),
    "Arboledas": (29.0910, -110.8850),
    "Encantada": (29.0950, -110.8780),
    "Real de Tajeda": (29.0350, -110.8800),
    "Lomas de Sonora": (29.1100, -110.9610),
    "Felipe Carrillo Puerto": (29.1200, -110.9520),
    "Constituyentes": (29.1250, -110.9720),
    "San Antonio": (29.1320, -110.9850),
    "Paseos del Mayab": (29.1280, -110.9420),
    "Moderno": (29.1350, -110.9500),
    "Campestre": (29.1100, -110.9850),
    "Sección Separada": (29.0900, -110.9900),
    "Las Quintas": (29.1010, -111.0020),
    "Ejido Providencia": (29.1120, -111.0150),
    "Las Anacuas": (29.0480, -110.9620),
    "Sonora Nueva": (29.0620, -110.9220),
    "Ranchería Vieja": (29.0300, -110.9700),
    "San Isidro": (29.0510, -111.0020),
    "Reforma": (29.0560, -110.9920),
    "Prolongación Villa de Seris": (29.0220, -110.9510),
    "Alameda": (29.0300, -110.9920),
    "Puesta del Sol": (29.1130, -110.8720),
    "Rinconada": (29.1180, -110.8900),
    "La Matanza Ampliación": (29.0780, -110.9380),
}

def calcular_centroide(coordinates):
    """Calcula el centroide de un polígono"""
    lats = [coord[1] for coord in coordinates[0]]
    lngs = [coord[0] for coord in coordinates[0]]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))

def encontrar_colonia_base(centroide):
    """Encuentra la colonia principal más cercana"""
    centroide_lat, centroide_lng = centroide
    
    min_dist = float('inf')
    colonia_cercana = None
    
    for nombre, (lat, lng) in COLONIAS_PRINCIPALES.items():
        dist = ((lat - centroide_lat) ** 2 + (lng - centroide_lng) ** 2) ** 0.5
        if dist < min_dist:
            min_dist = dist
            colonia_cercana = nombre
    
    return colonia_cercana

# Cargar GeoJSON
geojson_path = Path('data/hermosillo_colonias_real.geojson')

with open(geojson_path, 'r', encoding='utf-8') as f:
    geojson = json.load(f)

print(f"Procesando {len(geojson['features'])} polígonos...")

# Agrupar por colonia base
colonias_grupos = {}

for feature in geojson['features']:
    try:
        coordinates = feature['geometry']['coordinates']
        centroide = calcular_centroide(coordinates)
        colonia_base = encontrar_colonia_base(centroide)
        
        if colonia_base not in colonias_grupos:
            colonias_grupos[colonia_base] = []
        
        colonias_grupos[colonia_base].append({
            'feature': feature,
            'centroide': centroide
        })
    except Exception as e:
        print(f"Error: {e}")

print(f"\n✓ Agrupados en {len(colonias_grupos)} zonas principales")

# Generar nombres para cada polígono
contador_total = 0

for colonia_base in sorted(colonias_grupos.keys()):
    grupo = colonias_grupos[colonia_base]
    
    # Ordenar por proximidad
    grupo.sort(key=lambda x: (x['centroide'][1], x['centroide'][0]))
    
    # Asignar nombres
    for sub_idx, item in enumerate(grupo):
        feature = item['feature']
        
        if len(grupo) == 1:
            # Solo una unidad en esta colonia
            nombre = colonia_base
        elif len(grupo) <= 3:
            # Pocas unidades: usar puntos cardinales
            cardinal = ["Sur", "Centro", "Norte"][sub_idx % 3]
            nombre = f"{colonia_base} - {cardinal}"
        else:
            # Muchas unidades: usar números descriptivos
            sector = (sub_idx // 3) + 1
            posicion = ["Sur", "Centro", "Norte"][sub_idx % 3]
            nombre = f"{colonia_base} {sector}-{posicion[:1]}"
        
        feature['properties']['NOMBRE_LOC'] = nombre
        contador_total += 1

# Guardar
with open(geojson_path, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False)

file_size = geojson_path.stat().st_size / 1024

print(f"\n✅ GUARDADO:")
print(f"   ✓ {contador_total} polígonos con nombres inteligentes")
print(f"   ✓ Archivo: {geojson_path} ({file_size:.1f} KB)")

# Mostrar ejemplos
print(f"\n📊 Distribución de AGEBs por colonia:")
for colonia in sorted(colonias_grupos.keys())[:15]:
    count = len(colonias_grupos[colonia])
    print(f"   • {colonia:30s} → {count:3d} AGEBs")

if len(colonias_grupos) > 15:
    print(f"   ... y {len(colonias_grupos) - 15} colonias más")

# Mostrar ejemplos de nombres generados
print(f"\n📍 Ejemplos de nombres generados:")
ejemplos_mostrados = 0
for colonia in sorted(colonias_grupos.keys()):
    grupo = colonias_grupos[colonia]
    grupo.sort(key=lambda x: (x['centroide'][1], x['centroide'][0]))
    
    for item in grupo[:min(2, len(grupo))]:
        nombre = item['feature']['properties']['NOMBRE_LOC']
        print(f"   • {nombre}")
        ejemplos_mostrados += 1
        if ejemplos_mostrados >= 20:
            break
    
    if ejemplos_mostrados >= 20:
        break
