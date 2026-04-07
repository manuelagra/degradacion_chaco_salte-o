# degradacion_chaco_salte-o
Forest degradation detection through passive sensor indices using Sentinel-2 on Google Earth Engine.
This script was made using Gemini. 
The Area of Interest is a region called Salta-Forestal in Anta Department in the Province of Salta in Argentina.
We assessed several indices such as NDVI, EVI, NDMI, NBR, AWEI. We also ran the Structural Disturbance Index (Indice de Perturbación Estructural, IPE)
Technical Summary: Forest Degradation Monitoring
This workflow integrates multiple spectral indices to characterize forest structural integrity in the Gran Chaco. The NDVI (Rouse et al., 1974) and EVI (Huete et al., 2002) monitor photosynthetic vigor and canopy greenness, while the NDMI (Gao, 1996) and NBR (Key & Benson, 2006) target canopy moisture and structural disturbance through Short-Wave Infrared (SWIR) sensitivity. To improve the detection of "silent" degradation, the Structural Perturbation Index (SPI/IPE) was developed as a composite metric that cross-references hydric stress and biomass loss. Finally, the AWEI (Feyisa et al., 2014) is utilized to suppress shadow and soil noise in complex wooded environments, ensuring that detected changes reflect true ecological shifts rather than environmental artifacts
