# Mauritania Administrative Reference

Yala models Mauritania's administrative hierarchy as:

`Region (Wilaya) -> Department (Moughataa) -> Commune -> Locality`

The operational `City` model remains the service-area record used by riders,
drivers, rides, pricing, and analytics. A city can be linked to its official
commune while service availability is enabled independently at each level.

## Seed Coverage

- 15 active wilayas
- 63 moughataas
- 238 communes
- Existing Yala cities migrated as initial service localities

## Primary Sources

- Mauritania Ministry of Digital Transformation and Administration
  Modernization, 2025 digital addressing requirements:
  `https://mtnima.gov.mr/wp-content/uploads/2025/03/DSI-adressage-20250310.pdf`
- ANSADE statistical yearbook:
  `https://ansade.mr/wp-content/uploads/2022/01/Annuaire_Statistique-2020-2021.pdf`

The 2025 addressing document contains both an older 218-commune summary and an
expanded 238-commune table. Yala uses the expanded table and keeps service
availability separate so administrators can correct names or activate new
areas without code changes.
