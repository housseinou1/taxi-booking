import {
  filterMajorOperatingLocationCities,
  isMajorOperatingCityName,
  MAJOR_OPERATING_CITIES,
} from "../majorOperatingCities";

describe("majorOperatingCities", () => {
  it("recognises the 13 primary metros and common spellings", () => {
    expect(MAJOR_OPERATING_CITIES).toHaveLength(13);
    expect(isMajorOperatingCityName("Kaédi")).toBe(true);
    expect(isMajorOperatingCityName("Kaedi")).toBe(true);
    expect(isMajorOperatingCityName("Aïoun el-Atrouss")).toBe(true);
    expect(isMajorOperatingCityName("Ouadane")).toBe(false);
    expect(isMajorOperatingCityName("Nouakchott Ouest")).toBe(true);
  });

  it("filters location rows to majors and collapses Nouakchott", () => {
    const rows = filterMajorOperatingLocationCities([
      { id: 1, name: "Ouadane", is_active: true },
      { id: 2, name: "Kiffa", is_active: true },
      { id: 3, name: "Nouakchott Nord", is_active: true },
      { id: 4, name: "Nouakchott Sud", is_active: true },
      { id: 5, name: "Rosso", is_active: true },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Nouakchott", "Rosso", "Kiffa"]);
  });
});
