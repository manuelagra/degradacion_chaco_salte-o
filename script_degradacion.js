/**
 * ANÁLISIS INTEGRAL DE DEGRADACIÓN - GRAN CHACO (SALTA) AOI: COBERTURAS DE BOSQUES Y LEÑOSAS NATURALES EXCLUYENDO LOTES DE PRODUCCION DE CULTIVOS Y PASTURAS PARA GANADO VACUNO.
 * Sensor: Sentinel-2 MSI (10m) | Período: 2017 - 2026
 * Ventana Estacional: Marzo - Mayo
 */
// 1. CONFIGURACIÓN DE ÁREA
var aoi = ee.FeatureCollection("XXXXX").geometry();
Map.centerObject(aoi, 11);

// 2. DEFINICIÓN DE FUNCIONES DE PROCESAMIENTO
function prepareSentinel(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
  var optical = image.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']).divide(10000);
  return optical.select(
    ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
    ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
  ).updateMask(mask).copyProperties(image, ["system:time_start"]);
}

function addIndices(img) {
  var ndvi = img.normalizedDifference(['nir', 'red']).rename('NDVI');
  var nbr = img.normalizedDifference(['nir', 'swir2']).rename('NBR');
  var ndmi = img.normalizedDifference(['nir', 'swir1']).rename('NDMI');
  var evi = img.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': img.select('nir'), 'RED': img.select('red'), 'BLUE': img.select('blue')
  }).rename('EVI');
  var awei = img.expression(
    '4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)', {
      'GREEN': img.select('green'), 'SWIR1': img.select('swir1'),
      'NIR': img.select('nir'), 'SWIR2': img.select('swir2')
  }).rename('AWEI');
  
  return img.addBands([ndvi, nbr, ndmi, evi, awei]);
}

// 3. COLECCIÓN Y COMPUESTOS TEMPORALES (2017-2026)
var s2Col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(aoi)
  .filter(ee.Filter.calendarRange(3, 5, 'month')) 
  .filter(ee.Filter.calendarRange(2017, 2026, 'year'))
  .map(prepareSentinel)
  .map(addIndices);

// Generar serie de compuestos anuales
var yearlyComposites = ee.ImageCollection.fromImages(
  ee.List.sequence(2017, 2025).map(function(y) {
    return s2Col.filter(ee.Filter.calendarRange(y, y, 'year'))
      .median()
      .set('year', y)
      .set('system:time_start', ee.Date.fromYMD(y, 4, 1).millis());
}));

// Definición de Periodos para el cálculo de Deltas
var p_inicio = yearlyComposites.filter(ee.Filter.calendarRange(2017, 2018, 'year')).mean();
var p_final = yearlyComposites.filter(ee.Filter.calendarRange(2024, 2025, 'year')).mean();

// 4. GENERACIÓN DE DELTAS INDIVIDUALES
var delta_NDVI = p_final.select('NDVI').subtract(p_inicio.select('NDVI')).rename('Delta_NDVI');
var delta_EVI = p_final.select('EVI').subtract(p_inicio.select('EVI')).rename('Delta_EVI');
var delta_NDMI = p_final.select('NDMI').subtract(p_inicio.select('NDMI')).rename('Delta_NDMI');
var delta_NBR = p_final.select('NBR').subtract(p_inicio.select('NBR')).rename('Delta_NBR');
var delta_AWEI = p_final.select('AWEI').subtract(p_inicio.select('AWEI')).rename('Delta_AWEI');

// 5. ÍNDICE DE PERTURBACIÓN ESTRUCTURAL (IPE) Y DEGRADACIÓN SILENCIOSA
// El IPE combina pérdida de humedad y daño estructural del dosel
var IPE = delta_NBR.add(delta_NDMI).rename('IPE_Estructural');

// Degradación Silenciosa: Caída estructural fuerte pero NDVI estable (raleo/ganadería)
var deg_silenciosa = IPE.lt(-0.15).and(delta_NDVI.gt(-0.03)).rename('Degradacion_Silenciosa');

// 6. VISUALIZACIÓN EN EL MAPA
var visDeltas = {min: -0.15, max: 0.15, palette: ['#d73027', '#f4a582', '#ffffff', '#a6d96a', '#1a9850']};
var visIPE = {min: -0.4, max: 0, palette: ['#67001f', '#d6604d', '#f4a582', '#ffffff']};

Map.addLayer(delta_NDVI.clip(aoi), visDeltas, 'Delta NDVI (17-25)');
Map.addLayer(delta_NDMI.clip(aoi), visDeltas, 'Delta NDMI (Humedad)');
Map.addLayer(delta_NBR.clip(aoi), visDeltas, 'Delta NBR (Estructura)');
Map.addLayer(delta_AWEI.clip(aoi), {min: -0.05, max: 0.05, palette: ['blue', 'white', 'red']}, 'Delta AWEI');
Map.addLayer(IPE.clip(aoi), visIPE, 'IPE (Perturbación Estructural)');
Map.addLayer(deg_silenciosa.updateMask(deg_silenciosa).clip(aoi), {palette: ['#00FFFF']}, 'Degradación Silenciosa (Cian)');

// 7. EXPORTACIÓN MASIVA (Pestaña Tasks)
var outputs = [delta_NDVI, delta_EVI, delta_NDMI, delta_NBR, delta_AWEI, IPE, deg_silenciosa];

outputs.forEach(function(img) {
  var name = img.bandNames().get(0).getInfo();
  Export.image.toDrive({
    image: img.clip(aoi),
    description: 'S2_Export_' + name + '_2017_2026',
    scale: 10,
    region: aoi,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e13
  });
});

// 8. DIAGNÓSTICO Y GRÁFICOS EN CONSOLA
print('Serie Temporal Analizada:', yearlyComposites.aggregate_array('year'));

['NDVI', 'NDMI', 'NBR'].forEach(function(idx) {
  print(ui.Chart.image.series(yearlyComposites.select(idx), aoi, ee.Reducer.mean(), 30)
    .setOptions({
      title: 'Tendencia ' + idx + ' (Media AOI 2017-2025)',
      vAxis: {title: 'Valor'},
      hAxis: {title: 'Año', format: 'YYYY'},
      series: {0: {color: '#228B22'}}
    }));
});
