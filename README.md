# degradacion_chaco_salte-o
Forest degradation detection through passive sensor indices using Sentinel-2 on Google Earth Engine.
This script was made using Gemini. 
The Area of Interest is a region called Salta-Forestal in Anta Department in the Province of Salta in Argentina.
We assessed several indices such as NDVI, EVI, NDMI, NBR, AWEI. We also ran the Scaled Disturbance Index.
Technical Summary: Forest Degradation Monitoring
This workflow integrates multiple spectral indices to characterize forest structural integrity in the Gran Chaco. The NDVI (Rouse et al., 1974) and EVI (Huete et al., 2002) monitor photosynthetic vigor and canopy greenness, while the NDMI (Gao, 1996) and NBR (Key & Benson, 2006) target canopy moisture and structural disturbance through Short-Wave Infrared (SWIR) sensitivity. To improve the detection of "silent" degradation, the Structural Perturbation Index (SPI/IPE) was developed as a composite metric that cross-references hydric stress and biomass loss. Finally, the AWEI (Feyisa et al., 2014) is utilized to suppress shadow and soil noise in complex wooded environments, ensuring that detected changes reflect true ecological shifts rather than environmental artifacts

Index	Primary Source / Reference
NDVI	Rouse, J. W., et al. (1974). Monitoring the vernal advancement and retrogradation of natural vegetation. NASA/GSFC Type III Final Report.
EVI	Huete, A., et al. (2002). Overview of the radiometric and biophysical performance of the MODIS vegetation indices. Remote Sensing of Environment.
NDMI	Gao, B. C. (1996). NDWI—A normalized difference water index for remote sensing of vegetation liquid water from space. Remote Sensing of Environment.
NBR	Key, C. H., & Benson, N. C. (2006). Landscape Assessment (LA): Sampling and Analysis Methods. USDA Forest Service.
AWEI	Feyisa, G. L., et al. (2014). Automated Water Extraction Index: A new technique for surface water mapping using Landsat imagery. Remote Sensing of Environment.
IPE / SPI	Based on the Scaled Disturbance Index (SDI) principles: Healey, S. P., et al. (2005). Comparison of Tasseled Cap-based disturbance detection methods. Remote Sensing of Environment.
