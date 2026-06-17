import { filterLocations } from './locationFilter';

const testLocations = [
  { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
  { city: 'Nouakchott', label: 'Dar Naim', position: [18.1018, -15.9307] },
  { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
  { city: 'Nouakchott', label: 'Marche Capitale', position: [18.0792, -15.9642] },
  { city: 'Nouakchott', label: 'Marche Cinquieme', position: [18.0604, -15.9708] },
  { city: 'Kiffa', label: 'Kiffa Center', position: [16.6166, -11.4042] },
  { city: 'Kiffa', label: 'Kiffa Market', position: [16.6190, -11.4010] },
];

describe('filterLocations', () => {
  it('returns all locations for city when query is empty', () => {
    const results = filterLocations('', 'Nouakchott', testLocations);
    expect(results).toHaveLength(5);
    results.forEach((loc) => expect(loc.city).toBe('Nouakchott'));
  });

  it('filters by case-insensitive substring match', () => {
    const results = filterLocations('mar', 'Nouakchott', testLocations);
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe('Marche Capitale');
    expect(results[1].label).toBe('Marche Cinquieme');
  });

  it('returns starts-with matches before contains matches', () => {
    const results = filterLocations('ar', 'Nouakchott', testLocations);
    // 'Arafat' starts with 'ar', others contain 'ar'
    expect(results[0].label).toBe('Arafat');
  });

  it('is case-insensitive', () => {
    const results = filterLocations('KSAR', 'Nouakchott', testLocations);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Ksar');
  });

  it('filters only within the specified city', () => {
    const results = filterLocations('ki', 'Kiffa', testLocations);
    expect(results).toHaveLength(2);
    results.forEach((loc) => expect(loc.city).toBe('Kiffa'));
  });

  it('returns empty array when no matches found', () => {
    const results = filterLocations('xyz', 'Nouakchott', testLocations);
    expect(results).toHaveLength(0);
  });

  it('handles null query', () => {
    const results = filterLocations(null, 'Nouakchott', testLocations);
    expect(results).toHaveLength(5);
  });

  it('trims whitespace from query', () => {
    const results = filterLocations('  ksar  ', 'Nouakchott', testLocations);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Ksar');
  });

  it('uses MARKET.locations when no locations argument provided', () => {
    // This test uses the default MARKET.locations
    const results = filterLocations('Arafat', 'Nouakchott');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label).toContain('Arafat');
  });
});
