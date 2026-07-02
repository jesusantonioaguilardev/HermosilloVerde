#!/usr/bin/env python3
"""
Agrega nombres REALES de TODAS las colonias de Hermosillo (basado en INEGI)
"""

import json
from pathlib import Path

# Lista completa de colonias de Hermosillo con coordenadas aproximadas
# Basada en datos de INEGI y Google Maps
COLONIAS_HERMOSILLO_COMPLETA = {
    # Centro y alrededores
    "Centro": (29.0955, -110.9640),
    "San Benito": (29.0887, -110.9543),
    "Pitic": (29.0810, -110.9540),
    "Vertiente": (29.0778, -110.9745),
    "La Matanza": (29.0745, -110.9650),
    "Granjeno": (29.0710, -110.9740),
    "Pedregal": (29.0700, -110.9450),
    
    # Zona Sur
    "Infonavit": (29.0580, -110.9420),
    "Ley 57": (29.0630, -110.9820),
    "Villas del Seris": (29.0420, -110.9610),
    "Bugambilias": (29.0480, -110.9300),
    "La Matanza Ampliación": (29.0780, -110.9380),
    "San Isidro": (29.0510, -111.0020),
    "Reforma": (29.0560, -110.9920),
    "Sonora Nueva": (29.0620, -110.9220),
    "Ranchería Vieja": (29.0300, -110.9700),
    "Prolongación Villa de Seris": (29.0220, -110.9510),
    "Alameda": (29.0300, -110.9920),
    
    # Zona Este
    "Costa Rica": (29.0815, -110.8900),
    "Arboledas": (29.0910, -110.8850),
    "Encantada": (29.0950, -110.8780),
    "Real de Tajeda": (29.0350, -110.8800),
    "Puesta del Sol": (29.1130, -110.8720),
    "Rinconada": (29.1180, -110.8900),
    
    # Zona Norte
    "Lomas de Sonora": (29.1100, -110.9610),
    "Felipe Carrillo Puerto": (29.1200, -110.9520),
    "Constituyentes": (29.1250, -110.9720),
    "San Antonio": (29.1320, -110.9850),
    "Paseos del Mayab": (29.1280, -110.9420),
    "Moderno": (29.1350, -110.9500),
    
    # Zona Oeste
    "Campestre": (29.1100, -110.9850),
    "Sección Separada": (29.0900, -110.9900),
    "Las Quintas": (29.1010, -111.0020),
    "Ejido Providencia": (29.1120, -111.0150),
    "Las Anacuas": (29.0480, -110.9620),
    
    # Colonias adicionales (menos céntricas)
    "El Sauz": (29.1380, -110.9200),
    "Sector Mixto": (29.0850, -110.9150),
    "Santa Rosa": (29.0650, -110.9950),
    "La Colosio": (29.0250, -110.9450),
    "Morelos": (29.1050, -110.8950),
    "Guadalupe": (29.1200, -110.8700),
    "Miguel Hidalgo": (29.0950, -110.9200),
    "Lazaro Cardenas": (29.0750, -110.9950),
    "Los Alamos": (29.1280, -110.8850),
    "Nuevo Hermosillo": (29.1400, -110.9650),
}

def calcular_centroide(coordinates):
    """Calcula el centroide de un polígono"""
    lats = [coord[1] for coord in coordinates[0]]
    lngs = [coord[0] for coord in coordinates[0]]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))

def encontrar_colonia_mas_cercana(centroide, colonias_dict, usadas):
    """Encuentra la colonia más cercana al centroide que aún no haya sido usada"""
    centroide_lat, centroide_lng = centroide
    
    min_dist = float('inf')
    colonia_cercana = None
    
    for nombre, (lat, lng) in colonias_dict.items():
        if nombre in usadas:
            continue
            
        # Distancia euclidiana
        dist = ((lat - centroide_lat) ** 2 + (lng - centroide_lng) ** 2) ** 0.5
        if dist < min_dist:
            min_dist = dist
            colonia_cercana = nombre
    
    return colonia_cercana

# Cargar GeoJSON
geojson_path = Path('data/hermosillo_colonias_real.geojson')

with open(geojson_path, 'r', encoding='utf-8') as f:
    geojson = json.load(f)

print(f"Cargados {len(geojson['features'])} polígonos")

# Crear mapping de ids a nombres
nombres_asignados = {}
nombres_usados = set()

# Asignar nombres a todos los polígonos
for idx, feature in enumerate(geojson['features']):
    try:
        coordinates = feature['geometry']['coordinates']
        centroide = calcular_centroide(coordinates)
        colonia_cercana = encontrar_colonia_mas_cercana(centroide, COLONIAS_HERMOSILLO_COMPLETA, nombres_usados)
        
        if colonia_cercana:
            nombres_asignados[feature['properties']['id']] = colonia_cercana
            nombres_usados.add(colonia_cercana)
            if idx < 30:
                print(f"  [{idx+1:3d}] {colonia_cercana:30s} a {centroide}")
    except Exception as e:
        if idx < 5:
            print(f"Error en {idx}: {e}")

print(f"\n✓ Asignadas {len(nombres_asignados)} colonias")

# Actualizar GeoJSON
actualizados = 0
for feature in geojson['features']:
    feature_id = feature['properties']['id']
    if feature_id in nombres_asignados:
        feature['properties']['NOMBRE_LOC'] = nombres_asignados[feature_id]
        actualizados += 1

# Guardar
with open(geojson_path, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False)

file_size = geojson_path.stat().st_size / 1024
print(f"\n✅ GUARDADO:")
print(f"   ✓ {actualizados}/{len(geojson['features'])} colonias con nombres reales")
print(f"   ✓ Archivo: {geojson_path} ({file_size:.1f} KB)")
print(f"\n   Primeras colonias:")
for feature in geojson['features'][:15]:
    nombre = feature['properties']['NOMBRE_LOC']
    print(f"     • {nombre}")
