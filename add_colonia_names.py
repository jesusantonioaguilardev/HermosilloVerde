#!/usr/bin/env python3
"""
Agrega nombres reales de colonias a partir de coordenadas del GeoJSON
"""

import json
from pathlib import Path

# Diccionario de colonias principales de Hermosillo con nombres reales
COLONIAS_HERMOSILLO = {
    "Centro Histórico": (29.0960, -110.9627),
    "San Benito": (29.0887, -110.9543),
    "Pitic": (29.0810, -110.9540),
    "Vertiente": (29.0778, -110.9745),
    "La Matanza": (29.0745, -110.9650),
    "Granjeno": (29.0710, -110.9740),
    "Pedregal": (29.0700, -110.9450),
    "Campestre": (29.1100, -110.9850),
    "Sección Separada": (29.0900, -110.9900),
    "Infonavit": (29.0580, -110.9420),
    "Lomas de Sonora": (29.1100, -110.9610),
    "Felipe Carrillo Puerto": (29.1200, -110.9520),
    "Costa Rica": (29.0815, -110.8900),
    "Arboledas": (29.0910, -110.8850),
    "Constituyentes": (29.1250, -110.9720),
    "Ley 57": (29.0630, -110.9820),
    "Villas del Seris": (29.0420, -110.9610),
    "Las Quintas": (29.1010, -111.0020),
    "San Isidro": (29.0510, -111.0020),
    "Bugambilias": (29.0480, -110.9300),
    "Sonora Nueva": (29.0620, -110.9220),
    "Ranchería Vieja": (29.0300, -110.9700),
    "Encantada": (29.0950, -110.8780),
    "Prolongación Villa de Seris": (29.0220, -110.9510),
    "Paseos del Mayab": (29.1280, -110.9420),
    "Rinconada": (29.1180, -110.8900),
    "Real de Tajeda": (29.0350, -110.8800),
    "Reforma": (29.0560, -110.9920),
    "La Matanza Ampliación": (29.0780, -110.9380),
    "San Antonio": (29.1320, -110.9850),
    "Moderno": (29.1350, -110.9500),
    "Alameda": (29.0300, -110.9920),
    "Ejido Providencia": (29.1120, -111.0150),
    "Las Anacuas": (29.0480, -110.9620),
    "Puesta del Sol": (29.1130, -110.8720),
}

def calcular_centroide(coordinates):
    """Calcula el centroide de un polígono"""
    lats = [coord[1] for coord in coordinates[0]]
    lngs = [coord[0] for coord in coordinates[0]]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))

def encontrar_colonia_mas_cercana(centroide, colonias_dict):
    """Encuentra la colonia más cercana al centroide"""
    centroide_lat, centroide_lng = centroide
    
    min_dist = float('inf')
    colonia_cercana = None
    
    for nombre, (lat, lng) in colonias_dict.items():
        # Distancia euclidiana simple
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

# Crear mapping de centroides a nombres
centroides_a_nombres = {}
nombres_usados = set()

# Primero, asignar nombres a polígonos cercanos
for feature in geojson['features']:
    try:
        coordinates = feature['geometry']['coordinates']
        feature_id = feature['properties']['id']  # Obtener id de properties
        centroide = calcular_centroide(coordinates)
        colonia_cercana = encontrar_colonia_mas_cercana(centroide, COLONIAS_HERMOSILLO)
        
        if colonia_cercana and colonia_cercana not in nombres_usados:
            centroides_a_nombres[feature_id] = colonia_cercana
            nombres_usados.add(colonia_cercana)
    except Exception as e:
        print(f"Error procesando feature: {e}")

print(f"Encontradas {len(centroides_a_nombres)} asignaciones")

# Actualizar nombres en GeoJSON
actualizados = 0
for feature in geojson['features']:
    feature_id = feature['properties']['id']
    if feature_id in centroides_a_nombres:
        feature['properties']['NOMBRE_LOC'] = centroides_a_nombres[feature_id]
        actualizados += 1

print(f"Actualizadas {actualizados} colonias con nombres reales")

# Guardar
with open(geojson_path, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"✅ Guardado en {geojson_path}")
print(f"\nPrimeras 10 colonias con nombres:")
for feature in geojson['features'][:10]:
    nombre = feature['properties']['NOMBRE_LOC']
    print(f"  • {nombre}")
