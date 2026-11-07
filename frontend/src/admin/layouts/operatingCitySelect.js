/**
 * Build ``SearchableSelect`` / native ``<select>`` option rows from operating-city API payload.
 */
export function mapOperatingCitiesToOptions(rows, { includeAll = true } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const opts = list.map((row) => ({
    value: String(row.id),
    label: row.region?.name ? `${row.name} — ${row.region.name}` : row.name,
    hint: String(row.id),
    cityName: row.name,
    canonicalName: row.canonical_name || row.name,
    registryCityIds: row.registry_city_ids || [],
    primaryRegistryCityId: row.primary_registry_city_id,
  }));
  if (includeAll) {
    return [{ value: "", label: "All cities" }, ...opts];
  }
  return opts;
}

/** Driver admin filters match on ``city_name`` text — offer the 13 canonical names only. */
export function mapOperatingCitiesToNameFilterOptions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return [
    { value: "", label: "All cities" },
    ...list.map((row) => ({
      value: row.canonical_name || row.name,
      label: row.name,
    })),
  ];
}

/** Fleet vehicles use ``cities.City`` ids — map to primary registry id per metro. */
export function mapOperatingCitiesToRegistryOptions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const opts = list
    .filter((row) => row.primary_registry_city_id != null)
    .map((row) => ({
      value: String(row.primary_registry_city_id),
      label: row.name,
    }));
  return [{ value: "", label: "All cities" }, ...opts];
}
