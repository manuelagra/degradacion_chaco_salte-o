# degradacion_chaco_salte-o
JavaScript of Forest degradation detection through passive sensor indices using Sentinel-2 on Google Earth Engine. Script was written using Gemini.
The Area of Interest is a region called Salta-Forestal in Anta Department in the Province of Salta in Argentina.
We assessed several indices such as NDVI, EVI, NDMI, NBR, AWEI. We also ran the Scaled Disturbance Index.
Technical Summary: Forest Degradation Monitoring
The NDVI (Rouse et al., 1974) and EVI (Huete et al., 2002) monitor photosynthetic vigor and canopy greenness, while the NDMI (Gao, 1996) and NBR (Key & Benson, 2006) target canopy moisture and structural disturbance through Short-Wave Infrared (SWIR) sensitivity. To improve the detection of "silent" degradation, the Structural Perturbation Index (SPI/IPE) was developed as a composite metric that cross-references hydric stress and biomass loss. Finally, the AWEI (Feyisa et al., 2014) is utilized to suppress shadow and soil noise in complex wooded environments, ensuring that detected changes reflect true ecological shifts rather than environmental artifacts

References
NDVI	Rouse, J. W., et al. (1974). Monitoring the vernal advancement and retrogradation of natural vegetation. NASA/GSFC Type III Final Report.
EVI	Huete, A., et al. (2002). Overview of the radiometric and biophysical performance of the MODIS vegetation indices. Remote Sensing of Environment.
NDMI	Gao, B. C. (1996). NDWI—A normalized difference water index for remote sensing of vegetation liquid water from space. Remote Sensing of Environment.
NBR	Key, C. H., & Benson, N. C. (2006). Landscape Assessment (LA): Sampling and Analysis Methods. USDA Forest Service.
AWEI	Feyisa, G. L., et al. (2014). Automated Water Extraction Index: A new technique for surface water mapping using Landsat imagery. Remote Sensing of Environment.
IPE / SPI	Based on the Scaled Disturbance Index (SDI) principles: Healey, S. P., et al. (2005). Comparison of Tasseled Cap-based disturbance detection methods. Remote Sensing of Environment.

## Resumen Metodológico del Análisis de Degradación y Cambio de Biomasa en el Gran Chaco

Este notebook realiza un análisis multifacético para detectar la degradación forestal y el cambio de biomasa en la región del Gran Chaco, utilizando datos de teledetección de Sentinel-1 (SAR) y GEDI (Láser). El proceso se divide en las siguientes etapas:

### 1. Inicialización y Autenticación de Earth Engine

**Metodología:** Se inicializa la API de Google Earth Engine (EE) y se autentica el usuario con un ID de proyecto específico. Esto permite el acceso a los catálogos de datos geoespaciales de EE y la ejecución de operaciones de procesamiento en la nube.

**Interpretación de Resultados:** Una inicialización exitosa (`Earth Engine inicializado con el proyecto: [ID_PROYECTO]`) indica que el entorno está listo para procesar datos. Fallos en esta etapa suelen requerir una autenticación manual o verificar que la API de Earth Engine esté habilitada para el proyecto.

### 2. Análisis de Cambio Estructural con Sentinel-1 SAR

**Metodología:**
1.  **Carga de Datos:** Se accede a la colección de imágenes Sentinel-1 (GRD) y se filtra por el Área de Interés (AOI), polarización VH y modo de instrumento IW.
2.  **Composición por Periodos:** Se crean composiciones medianas para un período inicial (2017) y final (2024-2025).
3.  **Cálculo de `Delta_VH`:** Se calcula la diferencia en el retrodispersión VH entre el período final e inicial (`s1_2025.select('VH').subtract(s1_2017.select('VH'))`). La retrodispersión VH (polarización vertical de emisión, horizontal de recepción) es sensible a la estructura vertical de la vegetación.
4.  **Clasificación de Cambio Estructural:** Se clasifica el `Delta_VH` en tres categorías:
    *   **Pérdida (-1):** `Delta_VH` < -2 dB (indica una reducción significativa en la estructura, como deforestación).
    *   **Ganancia (1):** `Delta_VH` > 2 dB (indica un aumento en la estructura, como regeneración).
    *   **Sin Cambio (0):** `Delta_VH` entre -2 dB y 2 dB.

**Interpretación de Resultados:**
*   **`Delta_VH`:** Valores negativos (rojos en el mapa) sugieren una disminución en la estructura forestal (degradación, remoción de vegetación). Valores positivos (verdes) indican un aumento de la estructura. Valores cercanos a cero (blancos) sugieren estabilidad.
*   **`Structural_Change`:** El mapa clasificado proporciona una visión directa de dónde se ha producido una pérdida (rojo), ganancia (azul) o estabilidad (gris) en la estructura forestal. Una pérdida estructural es un fuerte indicador de degradación o deforestación.

### 3. Estimación de Cambio de Biomasa de Alta Resolución (10m) con NASA ORNL

**Metodología:**
1.  **Línea Base de Biomasa:** Se utiliza el dataset global de densidad de carbono de biomasa de la NASA ORNL (30m) como referencia para la biomasa aérea (AGB) del período inicial (2017).
2.  **Modelo de Sensibilidad Simplificado:** Se calcula un factor de cambio de biomasa (`biomass_change_factor`) a partir del `Delta_VH` de Sentinel-1 (`delta_vh.divide(5).exp()`). Este factor asume que el cambio en la retrodispersión VH está directamente relacionado con el cambio en la biomasa.
3.  **Estimación de AGB 2025 y Delta AGB:** La AGB de 2017 se resamplea a 10m y se multiplica por el `biomass_change_factor` para estimar la AGB de 2025. Finalmente, se calcula la diferencia (`Delta_AGB`) en Mg/ha.

**Interpretación de Resultados:**
*   **`AGB Baseline (NASA ORNL 30m)`:** Muestra la distribución inicial de la biomasa en la zona.
*   **`AGB Change 2017-2025 (Mg/ha)`:** Valores negativos (rojos) indican una pérdida de biomasa en Mg por hectárea. Valores positivos (azules) indican una ganancia. Este mapa permite cuantificar la magnitud del cambio de biomasa con una resolución de 10m, asumiendo la relación lineal entre el cambio SAR y la biomasa.

### 4. Análisis de Cambio de Biomasa con NASA GEDI L4A

**Metodología:**
1.  **Carga de Datos GEDI:** Se accede a la colección mensual de huellas de GEDI L4A, que proporciona la densidad de biomasa aérea (AGBD) en Mg/ha.
2.  **Definición de Períodos:** Se filtran los datos GEDI para dos períodos: uno inicial (2019-2020) y uno final (2023-2024).
3.  **Cálculo de AGBD Media:** Se calcula la media de AGBD para cada período sobre el AOI.
4.  **Cálculo de `AGBD_Change_Mgha`:** Se resta la AGBD media del período inicial a la del período final para obtener el cambio de biomasa en Mg/ha.
5.  **Estadísticas Espaciales:** Se calcula la superficie total del AOI en hectáreas y, usando el `AGBD_Change_Mgha`, se estima el cambio promedio en Mg/ha y la pérdida/ganancia total en toneladas para toda el área.

**Interpretación de Resultados:**
*   **`GEDI AGBD Change (2019-2024)`:** Un mapa que visualiza las áreas donde GEDI detectó cambios en la biomasa. Valores negativos (rojos) indican pérdida de biomasa; positivos (verdes) indican ganancia; blancos indican poco o ningún cambio. Es importante recordar que GEDI proporciona datos de "huellas" o puntos, no una cobertura continua como SAR o óptico, por lo que el mapa es una interpolación o una visualización de los valores medios.
*   **Resultados Numéricos (por ejemplo, `Cambio promedio (GEDI): 25.68 Mg/ha`, `Pérdida/Ganancia Total estimada: 6408304.21 Toneladas`):** Estos valores proporcionan una cuantificación directa del cambio neto de biomasa para el AOI en el período GEDI. Un valor positivo indica una ganancia neta, mientras que un valor negativo indicaría una pérdida neta. Son cifras agregadas que resumen la tendencia para toda la región analizada.

### 5. Comparación Específica GEDI: 2019 vs 2024

**Metodología:**
1.  **Filtrado por Año:** Se filtran los datos GEDI para obtener la AGBD media específicamente para 2019 y 2024.
2.  **Cálculo de `Delta_AGBD_19_24`:** Se calcula la diferencia directa entre la AGBD media de 2024 y 2019.
3.  **Estadísticas y Cuantificación:** Se calcula el cambio promedio en Mg/ha y la diferencia total en toneladas para el AOI entre estos dos años específicos.

**Interpretación de Resultados:**
*   **`Cambio Biomasa 2019-2024`:** Similar al mapa anterior, pero enfocado en el cambio directo entre los años 2019 y 2024. Los colores (rojo para pérdida, verde para ganancia, blanco para estabilidad) son consistentes. Esto permite identificar rápidamente las áreas con los mayores cambios en este período.
*   **Resultados Numéricos (por ejemplo, `Cambio Promedio GEDI (2019 vs 2024): 118.80 Mg/ha`, `Diferencia Total en el periodo: 29650269.88 Toneladas`):** Estos valores proporcionan una cuantificación más granular del cambio de biomasa entre dos puntos temporales específicos. La interpretación es la misma que la anterior: positivo indica ganancia neta, negativo indica pérdida neta. Son cruciales para entender tendencias a corto plazo.


### Descripción Técnica del Modelo

**Construcción mediante Embeddings y Segmentación:**
El modelo utiliza una técnica de *Feature Fusion* que integra datos espectrales (Sentinel-2) con información contextual de **Dynamic World (DW)**. En lugar de analizar píxeles aislados, se emplea el algoritmo **SNIC (Simple Non-Linear Iterative Clustering)** para agrupar píxeles en segmentos espaciales con propiedades similares. A cada segmento se le asignan "embeddings" derivados de las probabilidades medianas de DW (bosque, arbustos, suelo desnudo, etc.), creando una firma multidimensional que captura tanto la respuesta óptica como la probabilidad de cobertura terrestre. Estos datos alimentan un algoritmo de **Isolation Forest (Bosque de Aislamiento)**, el cual identifica anomalías estadísticas en estos embeddings; aquellas observaciones que se desvían significativamente del patrón de "normalidad" del ecosistema son marcadas como áreas con potencial degradación.

**Interpretación de Resultados:**

*   **DW_Prob_Bosque:** Representa la probabilidad continua (0 a 1) extraída de la banda `trees` de Dynamic World. Indica la densidad y presencia de cobertura arbórea según el modelo de aprendizaje profundo de Google.
*   **Anomalias_Degradacion:** Es el mapa binario resultante de la clasificación IA entrenada con *Isolation Forest*. Resalta las áreas donde la combinación de índices (NDVI/IPE) y embeddings de DW no concuerdan con un bosque sano, sugiriendo degradación sutil o raleo.

# Task
Perform a multitemporal forest degradation analysis in the Salta region for the period 2017-2026. Update the `start_date` to "2017-01-01" and `end_date` to "2026-12-31" to filter the "COPERNICUS/S2_SR_HARMONIZED" and "GOOGLE/DYNAMICWORLD/V1" collections. Create a function to generate annual median composites including NDVI, IPE, MIRBI, and Dynamic World probabilities. Generate a long-term spatial baseline using the SNIC segmentation algorithm on the 2017-2024 median composite. Extract annual mean features for each segment and train an Isolation Forest model to detect multitemporal anomalies representing forest degradation trends. Finally, visualize the forest probability and anomaly maps and export the results as GeoTIFF files to Google Drive using the provided AOI "users/manuelagra/salta_forestal_monte_1".


# Task
Perform a multitemporal forest degradation analysis in the Salta region for the period 2017-2026. Update the `start_date` to "2017-01-01" and `end_date` to "2026-12-31" to filter the "COPERNICUS/S2_SR_HARMONIZED" and "GOOGLE/DYNAMICWORLD/V1" collections. Create a function to generate annual median composites including NDVI, IPE, MIRBI, and Dynamic World probabilities. Generate a long-term spatial baseline using the SNIC segmentation algorithm on the 2017-2024 median composite. Extract annual mean features for each segment and train an Isolation Forest model to detect multitemporal anomalies representing forest degradation trends. Finally, visualize the forest probability and anomaly maps and export the results as GeoTIFF files to Google Drive using the provided AOI "users/manuelagra/salta_forestal_monte_1".

