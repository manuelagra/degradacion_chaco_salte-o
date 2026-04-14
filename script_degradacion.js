/**
 * PROYECTO: MONITOREO INTEGRAL DE DEGRADACIÓN Y FUEGO - GRAN CHACO (SALTA)
 * Sensor: Sentinel-2 MSI (10m) | Período: 2017 - 2026
 * Autor: [Manuel Agra] - using Gemini AI
 * Repositorio: degradacion-chaco-salteño
 */

// --- 1. CONFIGURACIÓN DE ÁREA Y VISUALIZACIÓN ---
var aoi = ee.FeatureCollection("users/manuelagra/salta_forestal_monte_1").geometry();
Map.centerObject(aoi, 11);

var visDeltas = {min: -0.15, max: 0.15, palette: ['#d73027', '#f4a582', '#ffffff', '#a6d96a', '#1a9850']};
var visIPE = {min: -0.4, max: 0, palette: ['#67001f', '#d6604d', '#f4a582', '#ffffff']};
var visFire = {min: -0.5, max: 0.5, palette: ['#1a9850', '#ffffff', '#d73027']}; // MIRBI: Rojo es aumento de quema

// --- 2. FUNCIONES DE PROCESAMIENTO Y CÁLCULO DE ÍNDICES ---
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
  var evi = img.expression('2.5*((NIR-RED)/(NIR+6*RED-7.5*BLUE+1))', 
    {'NIR':img.select('nir'),'RED':img.select('red'),'BLUE':img.select('blue')}).rename('EVI');
  var awei = img.expression('4*(GREEN-SWIR1)-(0.25*NIR+2.75*SWIR2)', 
    {'GREEN':img.select('green'),'SWIR1':img.select('swir1'),'NIR':img.select('nir'),'SWIR2':img.select('swir2')}).rename('AWEI');
  var mirbi = img.expression('10 * SWIR2 - 9.8 * SWIR1 + 2', 
    {'SWIR1': img.select('swir1'), 'SWIR2': img.select('swir2')}).rename('MIRBI');
  
  return img.addBands([ndvi, nbr, ndmi, evi, awei, mirbi]);
}

// --- 3. COLECCIÓN TEMPORAL Y COMPUESTOS (2017-2026) ---
var s2Col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(aoi)
  .filter(ee.Filter.calendarRange(3, 5, 'month')) 
  .filter(ee.Filter.calendarRange(2017, 2026, 'year'))
  .map(prepareSentinel)
  .map(addIndices);

var yearlyComposites = ee.ImageCollection.fromImages(
  ee.List.sequence(2017, 2025).map(function(y) {
    return s2Col.filter(ee.Filter.calendarRange(y, y, 'year'))
      .median()
      .set('year', y)
      .set('system:time_start', ee.Date.fromYMD(y, 4, 1).millis());
}));

var p_inicio = yearlyComposites.filter(ee.Filter.calendarRange(2017, 2018, 'year')).mean();
var p_final = yearlyComposites.filter(ee.Filter.calendarRange(2020, 2021, 'year')).mean();

// --- 4. ANÁLISIS DE DELTAS Y PRODUCTOS DERIVADOS ---
var dNDVI = p_final.select('NDVI').subtract(p_inicio.select('NDVI')).rename('Delta_NDVI');
var dEVI = p_final.select('EVI').subtract(p_inicio.select('EVI')).rename('Delta_EVI');
var dNDMI = p_final.select('NDMI').subtract(p_inicio.select('NDMI')).rename('Delta_NDMI');
var dNBR = p_final.select('NBR').subtract(p_inicio.select('NBR')).rename('Delta_NBR');
var dAWEI = p_final.select('AWEI').subtract(p_inicio.select('AWEI')).rename('Delta_AWEI');
var dMIRBI = p_final.select('MIRBI').subtract(p_inicio.select('MIRBI')).rename('Delta_MIRBI');

// IPE (Índice de Perturbación Estructural)
var IPE = dNBR.add(dNDMI).rename('IPE_Structural');

// Degradación Silenciosa
var silentDeg = IPE.lt(-0.15).and(dNDVI.gt(-0.03)).rename('Silent_Degradation');

// --- 5. MAPEO Y VISUALIZACIÓN ---
Map.addLayer(dNDVI.clip(aoi), visDeltas, '1. Delta NDVI');
Map.addLayer(dEVI.clip(aoi), visDeltas, '2. Delta EVI');
Map.addLayer(dNDMI.clip(aoi), visDeltas, '3. Delta NDMI');
Map.addLayer(dNBR.clip(aoi), visDeltas, '4. Delta NBR');
Map.addLayer(dAWEI.clip(aoi), {min: -0.05, max: 0.05, palette: ['blue', 'white', 'red']}, '5. Delta AWEI');
Map.addLayer(dMIRBI.clip(aoi), visFire, '6. Delta MIRBI (Fuego)');
Map.addLayer(IPE.clip(aoi), visIPE, '7. IPE (Perturbación Estructural)');
Map.addLayer(silentDeg.updateMask(silentDeg).clip(aoi), {palette: ['#00FFFF']}, '8. Degradación Silenciosa (Cian)');

// --- 6. GENERACIÓN DE GRÁFICOS DE TENDENCIA (TODOS) ---
var indicesList = ['NDVI', 'EVI', 'NDMI', 'NBR', 'AWEI', 'MIRBI'];
indicesList.forEach(function(idx) {
  var chart = ui.Chart.image.series(yearlyComposites.select(idx), aoi, ee.Reducer.mean(), 30)
    .setOptions({
      title: 'Serie Temporal: ' + idx + ' (Media AOI)',
      vAxis: {title: 'Valor del Índice'},
      hAxis: {title: 'Año', format: 'YYYY'},
      series: {0: {color: '#1d6b99', lineWidth: 2, pointsVisible: true}}
    });
  print(chart);
});

// --- 7. TAREAS DE EXPORTACIÓN (GEO-TIFF 10M) ---
//var outputs = [dNDVI, dEVI, dNDMI, dNBR, dAWEI, dMIRBI, IPE, silentDeg];
//outputs.forEach(function(img) {
//  var name = img.bandNames().get(0).getInfo();
//  Export.image.toDrive({
//    image: img.clip(aoi),
//    description: 'S2_Final_' + name + '_2017_2026',
//    scale: 10,
//    region: aoi,
//    fileFormat: 'GeoTIFF',
//    maxPixels: 1e13
//  });
//});
