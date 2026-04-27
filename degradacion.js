**Metodología:** Se definen y ejecutan tareas de exportación (`ee.batch.Export.image.toDrive`) para los productos clave generados (Delta VH, Cambio Estructural SAR, y los mapas de cambio de biomasa AGB de 10m y GEDI). Estos se guardan como archivos GeoTIFF en una carpeta específica de Google Drive.

**Interpretación de Resultados:** La salida (`Tarea iniciada: [NOMBRE_TAREA]`) confirma que los procesos de exportación se han iniciado en segundo plano en Earth Engine. Los resultados finales (GeoTIFFs) estarán disponibles en la carpeta `GEE_Chaco_Exports` en Google Drive una vez que las tareas se completen. Estos archivos pueden ser descargados y utilizados en software GIS (como QGIS o ArcGIS) para análisis adicionales o visualización fuera de Earth Engine.

### 1. Setup and Authentication
Authenticate and initialize the library.

import ee
import geemap

# ID del proyecto
project_id = '214353119094'

try:
    ee.Initialize(project=project_id)
    print(f'Earth Engine inicializado con el proyecto: {project_id}')
except Exception as e:
    print("Fallo la inicialización. Intentando autenticar...")
    ee.Authenticate()
    try:
        ee.Initialize(project=project_id)
        print(f'Earth Engine inicializado con el proyecto: {project_id}')
    except:
        print(f"Error: Asegúrate de que el proyecto {project_id} tenga habilitada la API de Earth Engine.")

### 2. Monitoring Degradation and Fire - Gran Chaco
Sentinel-2 indices (NDVI, EVI, NBR, MIRBI, IPE).

# 1. CONFIGURATION
aoi = ee.FeatureCollection("users/manuelagra/salta_forestal_monte_1").geometry()

# Visualization Parameters
vis_deltas = {'min': -0.15, 'max': 0.15, 'palette': ['#d73027', '#f4a582', '#ffffff', '#a6d96a', '#1a9850']}
vis_fire = {'min': -0.5, 'max': 0.5, 'palette': ['#1a9850', '#ffffff', '#d73027']}

def prepare_sentinel(image):
    qa = image.select('QA60')
    # FIXED: Changed 'and' to '.And()'
    mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
    optical = image.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']).divide(10000)
    return optical.select(
        ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
        ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    ).updateMask(mask).copyProperties(image, ["system:time_start"])

def add_indices(img):
    ndvi = img.normalizedDifference(['nir', 'red']).rename('NDVI')
    nbr = img.normalizedDifference(['nir', 'swir2']).rename('NBR')
    ndmi = img.normalizedDifference(['nir', 'swir1']).rename('NDMI')
    evi = img.expression('2.5*((NIR-RED)/(NIR+6*RED-7.5*BLUE+1))',
        {'NIR':img.select('nir'),'RED':img.select('red'),'BLUE':img.select('blue')}).rename('EVI')
    mirbi = img.expression('10 * SWIR2 - 9.8 * SWIR1 + 2',
        {'SWIR1': img.select('swir1'), 'SWIR2': img.select('swir2')}).rename('MIRBI')
    return img.addBands([ndvi, nbr, ndmi, evi, mirbi])

# --- S2 PROCESSING ---
# s2_col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
#           .filterBounds(aoi)
#           .filter(ee.Filter.calendarRange(3, 5, 'month'))
#           .filter(ee.Filter.calendarRange(2017, 2026, 'year'))
#           .map(prepare_sentinel)
#           .map(add_indices))
#
# years = ee.List.sequence(2017, 2025)
#
# def create_composite(y):
#     return (s2_col.filter(ee.Filter.calendarRange(y, y, 'year'))
#             .median()
#             .set('year', y)
#             .set('system:time_start', ee.Date.fromYMD(y, 4, 1).millis()))
#
# yearly_composites = ee.ImageCollection.fromImages(years.map(create_composite))
#
# p_inicio = yearly_composites.filter(ee.Filter.calendarRange(2017, 2018, 'year')).mean()
# p_final = yearly_composites.filter(ee.Filter.calendarRange(2025, 2026, 'year')).mean()
#
# dNDVI = p_final.select('NDVI').subtract(p_inicio.select('NDVI')).rename('Delta_NDVI')
# dNBR = p_final.select('NBR').subtract(p_inicio.select('NBR')).rename('Delta_NBR')
# IPE = dNBR.add(p_final.select('NDVI').subtract(p_inicio.select('NDVI'))).rename('IPE_Structural')
#
# Map = geemap.Map()
# Map.centerObject(aoi, 11)
# Map.addLayer(dNDVI.clip(aoi), vis_deltas, 'Delta NDVI')
# Map.addLayer(IPE.clip(aoi), {'min': -0.4, 'max': 0, 'palette': ['#67001f', '#d6604d', '#ffffff']}, 'IPE Structural')
# Map

### 3. Structural Change and Biomass Suggestions
*   **Structural Change:** **Sentinel-1 SAR** analysis. Sentinel-1 is sensitive to forest structure. You can calculate the difference in VH backscatter between 2017 and 2025. A significant drop in VH indicates structural loss.
*   **Biomass Change:** **NASA GEDI L4A** product for localized biomass samples or the **ESA CCI Biomass** dataset for global estimates, combined with your SAR backscatter changes to spatialize the loss in Mg/ha.

### 4. Structural Change Analysis (Sentinel-1 SAR)
In this section, we use active microwave sensors to detect changes in forest structure, which are less affected by cloud cover and more sensitive to woody biomass than optical indices.

# 1. Load Sentinel-1 Collection (GRD)
s1_col = (ee.ImageCollection('COPERNICUS/S1_GRD')
          .filterBounds(aoi)
          .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
          .filter(ee.Filter.eq('instrumentMode', 'IW')))

# Create composites for the start and end periods
s1_2017 = s1_col.filterDate('2017-01-01', '2017-12-31').median().clip(aoi)
s1_2025 = s1_col.filterDate('2024-01-01', '2025-12-31').median().clip(aoi)

# Calculate Change in VH (Structural Change Proxy)
delta_vh = s1_2025.select('VH').subtract(s1_2017.select('VH')).rename('Delta_VH')

# Classify changes
# Loss: Change < -2dB | No Change: -2 to 2 | Gain: > 2dB
structural_change = ee.Image(0).where(delta_vh.lt(-2), -1) \
                              .where(delta_vh.gt(2), 1) \
                              .rename('Structural_Change')

# 2. Above Ground Biomass (AGB) Estimation (ESA WorldBiomass)
# Note: This is a simplified approach using the ESA CCI Biomass dataset (approx 100m)
biomass_dataset = ee.ImageCollection("ESA/WorldCover/v100").first() # Placeholder for AGB integration
# A more precise implementation would involve a regression model between VH and GEDI L4A samples.

# Visualization
Map_S1 = geemap.Map()
Map_S1.centerObject(aoi, 11)
Map_S1.addLayer(delta_vh, {'min': -5, 'max': 5, 'palette': ['red', 'white', 'green']}, 'Delta VH (SAR)')
Map_S1.addLayer(structural_change, {'min': -1, 'max': 1, 'palette': ['red', 'grey', 'blue']}, 'Structural: Loss/Stable/Gain')
Map_S1

### 5. Exporting Results to Google Drive
This cell initializes the export tasks for the SAR analysis products.

# Define the exports
export_items = [
    {'image': delta_vh, 'name': 'S1_Delta_VH_2017_2025'},
    {'image': structural_change, 'name': 'S1_Structural_Change_2017_2025'}
]

for item in export_items:
    task = ee.batch.Export.image.toDrive(
        image=item['image'].clip(aoi),
        description=item['name'],
        folder='GEE_Chaco_Exports',
        scale=10,
        region=aoi,
        fileFormat='GeoTIFF',
        maxPixels=1e13
    )
    task.start()
    print(f'Tarea iniciada: {item["name"]}. Revisa tu Google Drive en unos minutos.')

### 6. High-Resolution (10m) Biomass Change Analysis
This approach uses the ESA CCI Biomass (100m) as a baseline and scales it to 10m using the Sentinel-1 SAR backscatter structural changes.

# 1. Load Reference Biomass (NASA ORNL Global Biomass Carbon Density - 30m)
reference_agb = ee.ImageCollection("NASA/ORNL/biomass_carbon_density/v1").first().clip(aoi)
# Select the aboveground biomass carbon band
reference_agb = reference_agb.select('agb').rename('agb')

# 2. Downscaling logic (Simplified Sensitivity Model)
# Calculate a scaling factor based on VH change from Sentinel-1
biomass_change_factor = delta_vh.divide(5).exp()

# Estimate AGB for 2017 (resampled) and 2025 at 10m
agb_2017 = reference_agb.resample('bilinear').reproject(crs=delta_vh.projection(), scale=10)
agb_2025 = agb_2017.multiply(biomass_change_factor).rename('AGB_2025_Estimated')

# Calculate Net Loss/Gain in Mg/ha
delta_agb = agb_2025.subtract(agb_2017).rename('Delta_AGB_Mgha')

# 3. Visualization
Map_AGB = geemap.Map()
Map_AGB.centerObject(aoi, 11)

vis_agb = {'min': 0, 'max': 150, 'palette': ['white', 'green', 'darkgreen']}
vis_agb_delta = {'min': -50, 'max': 20, 'palette': ['red', 'white', 'blue']}

Map_AGB.addLayer(agb_2017, vis_agb, 'AGB Baseline (NASA ORNL 30m)')
Map_AGB.addLayer(delta_agb, vis_agb_delta, 'AGB Change 2017-2025 (Mg/ha)')
Map_AGB

# 4. Export AGB results
task_agb = ee.batch.Export.image.toDrive(
    image=delta_agb.clip(aoi),
    description='S1_AGB_Change_10m_2017_2025_NASA',
    folder='GEE_Chaco_Exports',
    scale=10,
    region=aoi,
    fileFormat='GeoTIFF',
    maxPixels=1e13
)
task_agb.start()
print('Tarea de exportación de Biomasa (10m) iniciada exitosamente con el dataset NASA ORNL.')

### 7. Biomass Loss Analysis using NASA GEDI L4A
GEDI (Global Ecosystem Dynamics Investigation) provides high-quality forest structure measurements. Unlike Sentinel, it is a sampling mission (not a continuous grid). Here we calculate the biomass change by comparing mean biomass density from GEDI footprints across two periods.

import datetime

# 1. Load GEDI L4A Footprint Collection
gedi_col = ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY") \
            .filterBounds(aoi) \
            .select('agbd') # Aboveground Biomass Density (Mg/ha)

# 2. Define Time Periods (GEDI data starts in 2019)
# Since your baseline was 2017, we use the earliest GEDI data as a proxy or starting point
period_1 = gedi_col.filterDate('2020-04-01', '2020-12-31')
period_2 = gedi_col.filterDate('2023-01-01', '2024-12-31')

# 3. Calculate Mean Biomass Density (Mg/ha) for each period
mean_agbd_p1 = period_1.mean().clip(aoi)
mean_agbd_p2 = period_2.mean().clip(aoi)

# 4. Calculate Difference (Loss/Gain)
delta_agbd_gedi = mean_agbd_p2.subtract(mean_agbd_p1).rename('AGBD_Change_Mgha')

# 5. Spatial Statistics: Total Tonnes Lost
# Area in Hectares
aoi_area_ha = aoi.area().divide(10000)

# Reduce the delta image to a mean value over the AOI
stats = delta_agbd_gedi.reduceRegion(
    reducer=ee.Reducer.mean(),
    geometry=aoi,
    scale=25, # GEDI footprint is approx 25m
    maxPixels=1e9
)

mean_loss_mgha = ee.Number(stats.get('AGBD_Change_Mgha'))
total_tonnes = mean_loss_mgha.multiply(aoi_area_ha)

# Results
print(f'Superficie del AOI: {aoi_area_ha.getInfo():.2f} ha')
print(f'Cambio promedio (GEDI): {mean_loss_mgha.getInfo():.2f} Mg/ha')
print(f'Pérdida/Ganancia Total estimada: {total_tonnes.getInfo():.2f} Toneladas')

# Visualization
Map_GEDI = geemap.Map()
Map_GEDI.centerObject(aoi, 11)
Map_GEDI.addLayer(delta_agbd_gedi, {'min': -50, 'max': 50, 'palette': ['red', 'white', 'green']}, 'GEDI AGBD Change (2019-2024)')
Map_GEDI

### 8. Specific Comparison GEDI: 2019 vs 2024
This cell performs a direct comparison between the biomass density measured in 2019 and the most recent data from 2024.

# 1. Load GEDI and filter specific years
gedi_2020 = ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY") \
            .filterBounds(aoi).filterDate('2020-01-01', '2020-12-31').select('agbd').mean().clip(aoi)

gedi_2024 = ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY") \
            .filterBounds(aoi).filterDate('2024-01-01', '2024-12-31').select('agbd').mean().clip(aoi)

# 2. Calculate Difference
delta_20_24 = gedi_2024.subtract(gedi_2020).rename('Delta_AGBD_20_24')

# 3. Stats for the comparison
stats_20_24 = delta_20_24.reduceRegion(
    reducer=ee.Reducer.mean(),
    geometry=aoi,
    scale=25,
    maxPixels=1e9
)

mean_val = ee.Number(stats_20_24.get('Delta_AGBD_20_24'))
total_tons_20_24 = mean_val.multiply(aoi_area_ha)

print(f'Cambio Promedio GEDI (2019 vs 2024): {mean_val.getInfo():.2f} Mg/ha')
print(f'Diferencia Total en el periodo: {total_tons_20_24.getInfo():.2f} Toneladas')

# Add to Map
Map_20_24 = geemap.Map()
Map_20_24.centerObject(aoi, 11)
Map_20_24.addLayer(delta_20_24, {'min': -50, 'max': 50, 'palette': ['#d73027', '#ffffff', '#1a9850']}, 'Cambio Biomasa 2019-2024')
Map_20_24

# 4. Export GEDI AGBD Change result
task_gedi_20_24 = ee.batch.Export.image.toDrive(
    image=delta_20_24.clip(aoi),
    description='GEDI_AGBD_Change_2020_2024',
    folder='GEE_Chaco_Exports',
    scale=25, # GEDI footprint scale
    region=aoi,
    fileFormat='GeoTIFF',
    maxPixels=1e13
)
task_gedi_20_24.start()
print('Tarea de exportación de GEDI (2019-2024) iniciada exitosamente.')