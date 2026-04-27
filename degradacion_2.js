# ==========================================================================
# SEGMENTACIÓN + EMBEDDINGS DW + DETECCIÓN DE ANOMALÍAS
# ==========================================================================

!pip install geojson
import ee
import geemap
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

# 1. Inicialización Directa
try:
    ee.Initialize(project='214353119094')
except Exception:
    ee.Authenticate()
    ee.Initialize(project='214353119094')

# 2. Configuración del Área de Interés
aoi = ee.FeatureCollection("AOIXXXXXX").geometry()

# Rango temporal de análisis
start_date = '2024-03-01'
end_date = '2026-06-01'

# --- MÓDULO 1: FEATURE FUSION (Espectro + Textura DW) ---
def get_fused_features(img):
    opt = img.divide(10000).select(['B2','B3','B4','B8','B11','B12'], ['B','G','R','N','S1','S2'])
    ndvi = opt.normalizedDifference(['N','R']).rename('NDVI')
    ipe = opt.normalizedDifference(['N','S2']).add(opt.normalizedDifference(['N','S1'])).rename('IPE')
    mirbi = opt.expression('10*S2 - 9.8*S1 + 2', {'S1':opt.select('S1'),'S2':opt.select('S2')}).rename('MIRBI')

    dw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1") \
            .filterBounds(aoi) \
            .filterDate(start_date, end_date) \
            .median()

    dw_probs = dw.select(['trees', 'shrub_and_scrub', 'grass', 'bare', 'flooded_vegetation'])
    return ee.Image.cat([ndvi, ipe, mirbi, dw_probs])

# Compuesto Sentinel-2
base_img = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
            .filterBounds(aoi).filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)).median()

features_img = get_fused_features(base_img).clip(aoi)

# --- MÓDULO 2: SEGMENTACIÓN GEOGRÁFICA (SNIC) ---
print("Generando segmentos espaciales...")
seeds = ee.Algorithms.Image.Segmentation.seedGrid(30)
snic = ee.Algorithms.Image.Segmentation.SNIC(
    image=features_img,
    size=30,
    compactness=0,
    connectivity=8,
    seeds=seeds
).select(['NDVI_mean', 'IPE_mean', 'MIRBI_mean', 'trees_mean', 'shrub_and_scrub_mean', 'bare_mean', 'flooded_vegetation_mean'])

# --- MÓDULO 3: DETECCIÓN DE ANOMALÍAS ---
print("Extrayendo muestras y entrenando IA...")
features_list = ['NDVI_mean', 'IPE_mean', 'MIRBI_mean', 'trees_mean', 'shrub_and_scrub_mean', 'bare_mean', 'flooded_vegetation_mean']
# Usamos geemap.ee_to_df para asegurar una conversión limpia
sample_fc = snic.sample(region=aoi, scale=30, numPixels=2000, tileScale=16, geometries=True)
df = geemap.ee_to_df(sample_fc).dropna()

# Isolation Forest local
iso_forest = IsolationForest(contamination=0.1, random_state=42)
df['anomaly_score'] = (iso_forest.fit_predict(df[features_list]) == -1).astype(int)

# --- PROYECCIÓN Y VISUALIZACIÓN ---
print("Proyectando mapa final...")
# Para evitar errores de geometría en la conversión manual, creamos el clasificador
# entrenándolo con los datos del DF pero inyectándolos como una lista de Features
features_to_ee = []
for _, row in df.iterrows():
    feat = ee.Feature(None, {f: float(row[f]) for f in features_list})
    feat = feat.set('anomaly_score', int(row['anomaly_score']))
    features_to_ee.append(feat)

train_fc = ee.FeatureCollection(features_to_ee)
classifier = ee.Classifier.smileRandomForest(100).train(train_fc, 'anomaly_score', features_list)
anomaly_map = snic.select(features_list).classify(classifier)

Map = geemap.Map()
Map.centerObject(aoi, 11)
Map.addLayer(features_img.select('trees'), {'min':0, 'max':0.8, 'palette':['white', 'darkgreen']}, 'DW Prob. Bosque')
Map.addLayer(anomaly_map.updateMask(anomaly_map.gt(0)), {'palette': ['red']}, 'Anomalías (Degradación)')
Map.add_legend(title="Detección de Anomalías (AI)", labels={'Normalidad': '#ffffff00', 'Degradación': 'red'})
Map

print("Iniciando exportación de Rasters a Google Drive...")

# 1. Exportar Mapa de Probabilidad de Bosque (Dynamic World)
ee.batch.Export.image.toDrive(
    image=features_img.select('trees'),
    description='DW_Prob_Bosque_Salta',
    folder='EarthEngine_Exports',
    fileNamePrefix='DW_Prob_Bosque',
    scale=30,
    region=aoi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
).start()

# 2. Exportar Mapa de Anomalías (Clasificación de IA)
ee.batch.Export.image.toDrive(
    image=anomaly_map,
    description='Anomalias_Degradacion_Salta',
    folder='EarthEngine_Exports',
    fileNamePrefix='Anomalias_Degradacion',
    scale=30,
    region=aoi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
).start()

print("Tareas de exportación enviadas. Por favor, revisa tu consola de Google Earth Engine o espera a que se procesen en tu Google Drive (carpeta 'EarthEngine_Exports').")

import ee

# 1. Actualización de variables de rango temporal
start_year = 2017
end_year = 2026
start_date = '2017-01-01'
end_date = '2026-12-31'

# Asegurar que el AOI esté disponible
aoi = ee.FeatureCollection("AOIXXXXX").geometry()

# 2. Función para calcular índices espectrales
def get_indices(img):
    opt = img.divide(10000).select(['B2','B3','B4','B8','B11','B12'], ['B','G','R','N','S1','S2'])
    ndvi = opt.normalizedDifference(['N','R']).rename('NDVI')
    ipe = opt.normalizedDifference(['N','S2']).add(opt.normalizedDifference(['N','S1'])).rename('IPE')
    mirbi = opt.expression('10*S2 - 9.8*S1 + 2', {'S1':opt.select('S1'),'S2':opt.select('S2')}).rename('MIRBI')
    return ee.Image.cat([ndvi, ipe, mirbi])

# 3. Función principal para generar compuestos anuales
def get_annual_composite(year):
    date_start = ee.Date.fromYMD(year, 1, 1)
    date_end = ee.Date.fromYMD(year, 12, 31)

    # a. Compuesto Sentinel-2
    s2_col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
                .filterBounds(aoi) \
                .filterDate(date_start, date_end) \
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
                .median()

    # b. Compuesto Dynamic World
    dw_col = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1") \
                .filterBounds(aoi) \
                .filterDate(date_start, date_end) \
                .select(['trees', 'shrub_and_scrub', 'grass', 'bare', 'flooded_vegetation']) \
                .median()

    # c. Índices espectrales
    spectral_indices = get_indices(s2_col)

    # d. Fusión de bandas
    return ee.Image.cat([spectral_indices, dw_col]).set('year', year).clip(aoi)

# 4. Generar lista de compuestos anuales (2017-2026)
years = ee.List.sequence(start_year, end_year)
annual_composites = years.map(lambda y: get_annual_composite(ee.Number(y)))

print(f"Configuración completada para el periodo {start_year}-{end_year}.")
print("Función de generación de compuestos anuales definida.")


### Subtask:
Autenticar e inicializar la API de Google Earth Engine para el proyecto especificado.


**Reasoning**:
I will initialize the Earth Engine API and define the area of interest to ensure the connection is active for the subsequent analysis.


import ee

# 1. Inicialización y Autenticación de Earth Engine
try:
    ee.Initialize(project='214353119094')
    print('Earth Engine inicializado correctamente.')
except Exception as e:
    print('Iniciando proceso de autenticación...')
    ee.Authenticate()
    ee.Initialize(project='214353119094')
    print('Earth Engine inicializado tras autenticación.')

# 2. Definición del Área de Interés (AOI)
aoi = ee.FeatureCollection("AOIXXXX").geometry()
print('Geometría del AOI cargada correctamente.')

**Reasoning**:
I will define the temporal variables, create functions for spectral indices and annual composites, and generate the collection of processed images for the 2017-2026 period as specified in the instructions.


# 1. Definición de variables temporales
start_year = 2017
end_year = 2026
years = ee.List.sequence(start_year, end_year)

# 2. Función para calcular índices espectrales
def get_indices(img):
    # Escalamiento y selección de bandas Sentinel-2
    opt = img.divide(10000).select(['B2','B3','B4','B8','B11','B12'], ['B','G','R','N','S1','S2'])

    # Cálculo de índices
    ndvi = opt.normalizedDifference(['N','R']).rename('NDVI')
    ipe = opt.normalizedDifference(['N','S2']).add(opt.normalizedDifference(['N','S1'])).rename('IPE')
    mirbi = opt.expression('10*S2 - 9.8*S1 + 2', {'S1':opt.select('S1'),'S2':opt.select('S2')}).rename('MIRBI')

    return ee.Image.cat([ndvi, ipe, mirbi])

# 3. Función principal para generar compuestos anuales fusionados
def get_annual_composite(year):
    year = ee.Number(year)
    date_start = ee.Date.fromYMD(year, 1, 1)
    date_end = ee.Date.fromYMD(year, 12, 31)

    # a. Compuesto Sentinel-2 (Mediana con filtro de nubes < 20%)
    s2_median = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
                .filterBounds(aoi) \
                .filterDate(date_start, date_end) \
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
                .median()

    # b. Compuesto Dynamic World (Mediana de probabilidades)
    dw_median = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1") \
                .filterBounds(aoi) \
                .filterDate(date_start, date_end) \
                .select(['trees', 'shrub_and_scrub', 'grass', 'bare', 'flooded_vegetation']) \
                .median()

    # c. Concatenación de Índices + Dynamic World
    spectral_indices = get_indices(s2_median)

    return ee.Image.cat([spectral_indices, dw_median]) \
        .set('year', year) \
        .set('system:time_start', date_start.millis()) \
        .clip(aoi)

# 4. Generar la colección de imágenes procesadas (2017-2026)
annual_composites_list = years.map(get_annual_composite)
annual_composites_col = ee.ImageCollection.fromImages(annual_composites_list)

print(f"Compuestos anuales generados para el periodo {start_year}-{end_year}.")
print("Bandas disponibles per imagen:", annual_composites_col.first().bandNames().getInfo())

## Generación de Compuestos Anuales 2017-2026

# 1. Crear imagen de referencia mediana (2017-2024)
baseline_img = annual_composites_col.filter(ee.Filter.rangeContains('year', 2017, 2024)).median()

# 2. Definir cuadrícula de semillas para la segmentación
seeds = ee.Algorithms.Image.Segmentation.seedGrid(30)

# 3. Aplicar el algoritmo SNIC (Simple Non-Linear Iterative Clustering)
snic_results = ee.Algorithms.Image.Segmentation.SNIC(
    image=baseline_img,
    size=30,
    compactness=0,
    connectivity=8,
    seeds=seeds
)

# 4. Seleccionar las bandas de medias de los segmentos
# Estas bandas representan los clusters espaciales estables
features_list = ['NDVI_mean', 'IPE_mean', 'MIRBI_mean', 'trees_mean', 'shrub_and_scrub_mean', 'bare_mean', 'flooded_vegetation_mean']
spatial_clusters = snic_results.select(features_list)

print("Segmentación SNIC completada.")
print("Bandas del baseline segmentado:", spatial_clusters.bandNames().getInfo())

## Detección de Anomalías Multitemporales

### Subtask:
Extraer las series de tiempo por segmento y entrenar un modelo Isolation Forest para identificar tendencias de degradación forestal.

import geemap
import pandas as pd
from sklearn.ensemble import IsolationForest
import numpy as np

# 1. Muestreo de la imagen segmentada (spatial_clusters)
print("Extrayendo muestras de segmentos...")
sample_fc = spatial_clusters.sample(
    region=aoi,
    scale=30,
    numPixels=2000,
    tileScale=16,
    geometries=True
)

# 2. Conversión a DataFrame de Pandas
df = geemap.ee_to_df(sample_fc).dropna()

# 3. Configuración y entrenamiento de Isolation Forest
# El parámetro contamination indica la proporción esperada de anomalías (degradación)
iso_forest = IsolationForest(contamination=0.1, random_state=42)

# Entrenar con las bandas de medias extraídas en el paso anterior
df['anomaly_label'] = iso_forest.fit_predict(df[features_list])

# Convertir etiquetas: -1 (anomalía) a 1, y 1 (normal) a 0 para el clasificador
df['anomaly_score'] = (df['anomaly_label'] == -1).astype(int)

# 4. Mapear resultados a un Clasificador de Earth Engine
print("Entrenando clasificador espacial para proyecci\u00f3n...")

# Convertir el DataFrame de vuelta a FeatureCollection para entrenamiento en EE
features_to_ee = []
for _, row in df.iterrows():
    feat = ee.Feature(None, {f: float(row[f]) for f in features_list})
    feat = feat.set('anomaly_score', int(row['anomaly_score']))
    features_to_ee.append(feat)

train_fc = ee.FeatureCollection(features_to_ee)

# Entrenar un Random Forest para generalizar las anomalías detectadas por Isolation Forest
classifier = ee.Classifier.smileRandomForest(100).train(
    features=train_fc,
    classProperty='anomaly_score',
    inputProperties=features_list
)

# 5. Generar el mapa final de anomal\u00edas
anomaly_map = spatial_clusters.classify(classifier)

print("Modelo de detecci\u00f3n de anomal\u00edas entrenado y mapa generado.")
print(f"Total de muestras procesadas: {len(df)}")
print(f"Anomal\u00edas detectadas en la muestra: {df['anomaly_score'].sum()}")

# 1. Crear Mapa Interactivo y centrar en el AOI
Map = geemap.Map()
Map.centerObject(aoi, 11)

# 2. Configuración de Capas Visuales
# Probabilidad de Bosque (Baseline 2017-2024)
Map.addLayer(baseline_img.select('trees'),
             {'min': 0, 'max': 0.8, 'palette': ['white', 'darkgreen']},
             'Prob. Bosque (Baseline)')

# Mapa de Anomalías (Degradación)
# Usamos una máscara para mostrar solo el valor 1 (Anomalía)
anomaly_masked = anomaly_map.updateMask(anomaly_map.eq(1))
Map.addLayer(anomaly_masked,
             {'palette': ['red']},
             'Anomalías (Degradación)')

# 3. Añadir Leyenda
Map.add_legend(title="Detección de Anomalías (AI)",
               labels={'Normalidad': '#ffffff00', 'Degradación': 'red'})

# Mostrar el mapa
display(Map)

# 4. Configuración y ejecución de Exportaciones a Google Drive
print("Iniciando exportación de resultados a Google Drive...")

# Exportar Mapa de Probabilidad de Bosque
ee.batch.Export.image.toDrive(
    image=baseline_img.select('trees'),
    description='Prob_Bosque_Salta_2017_2024',
    folder='EarthEngine_Forest_Analysis',
    fileNamePrefix='Prob_Bosque_Salta',
    scale=30,
    region=aoi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
).start()

# Exportar Mapa Binario de Anomalías
ee.batch.Export.image.toDrive(
    image=anomaly_map,
    description='Anomalias_Degradacion_Salta_2017_2026',
    folder='EarthEngine_Forest_Analysis',
    fileNamePrefix='Anomalias_Salta_Final',
    scale=30,
    region=aoi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
).start()

print("Tareas de exportación enviadas. Verifica la pestaña 'Tasks' en el Code Editor de GEE o tu carpeta 'EarthEngine_Forest_Analysis' en Drive.")

# 1. Exportación del Baseline de Probabilidad de Bosque (2017-2024)
export_baseline = ee.batch.Export.image.toDrive(
    image=baseline_img.select('trees'),
    description='Prob_Bosque_Salta_2017_2024',
    folder='EarthEngine_Forest_Analysis',
    fileNamePrefix='Prob_Bosque_Salta_Baseline',
    scale=30,
    region=aoi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
)

# 2. Exportación del Mapa de Anomalías (Degradación 2017-2026)
export_anomalies = ee.batch.Export.image.toDrive(
    image=anomaly_map,
    description='Anomalias_Degradacion_Salta_2017_2026',
    folder='EarthEngine_Forest_Analysis',
    fileNamePrefix='Anomalias_Degradacion_Salta',
    scale=30,
    region=aoi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
)

# 3. Iniciar las tareas de exportación
export_baseline.start()
export_anomalies.start()

print("Tareas de exportación enviadas a Google Drive.")
print("Carpeta de destino: EarthEngine_Forest_Analysis")
print("Verifica el estado en la pestaña 'Tasks' del Code Editor de GEE o en tu cuenta de Drive.")
