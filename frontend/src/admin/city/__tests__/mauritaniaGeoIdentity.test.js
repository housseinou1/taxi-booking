/**
 * Mauritania geographical identification — region/wilaya and city codes.
 *
 * Pins the scheme the CEO specified, the special handling of Nouakchott as one capital with
 * three boroughs, and — most importantly — that the module never presents a proposal as an
 * assigned code and never invents one for a city it does not know.
 */
import {
  CLASSIFICATIONS,
  NOUAKCHOTT,
  PROPOSED_CITY_CODES,
  WILAYAS,
  nouakchottBoroughs,
  normalizeName,
  resolveCityIdentity,
  resolveRegion,
} from "../mauritaniaGeoIdentity";

test("carries all twelve wilayas with the specified region and capital codes", () => {
  expect(WILAYAS).toHaveLength(12);

  const expected = {
    Adrar: ["ADR", "ATR"],
    Assaba: ["ASB", "KIF"],
    Brakna: ["BRK", "ALG"],
    "Dakhlet Nouadhibou": ["DNB", "NDB"],
    Gorgol: ["GOR", "KAE"],
    Guidimakha: ["GDM", "SEL"],
    "Hodh Ech Chargui": ["HEC", "NEM"],
    "Hodh El Gharbi": ["HEG", "AYN"],
    Inchiri: ["INC", "AKJ"],
    Tagant: ["TAG", "TDJ"],
    "Tiris Zemmour": ["TZM", "ZOU"],
    Trarza: ["TRZ", "ROS"],
  };

  Object.entries(expected).forEach(([name, [regionCode, capitalCode]]) => {
    const wilaya = WILAYAS.find((w) => w.name === name);
    expect(wilaya).toBeDefined();
    expect(wilaya.regionCode).toBe(regionCode);
    expect(wilaya.capitalCode).toBe(capitalCode);
  });
});

test("builds the MR-REG-CITY code, e.g. MR-GOR-KAE for Kaédi in Gorgol", () => {
  const kaedi = resolveCityIdentity({ cityName: "Kaedi", regionName: "Gorgol" });
  expect(kaedi.yalaId).toBe("MR-GOR-KAE");
  expect(kaedi.classification).toBe(CLASSIFICATIONS.regionalCapital);
  expect(kaedi.assigned).toBe(true);

  const atar = resolveCityIdentity({ cityName: "Atar", regionName: "Adrar" });
  expect(atar.yalaId).toBe("MR-ADR-ATR");
});

test("matches accent-insensitively (Kaédi / Kaedi, Zouérat / Zouerate)", () => {
  const accented = resolveCityIdentity({ cityName: "Kaédi", regionName: "Gorgol" });
  const plain = resolveCityIdentity({ cityName: "Kaedi", regionName: "Gorgol" });
  expect(accented.yalaId).toBe(plain.yalaId);

  expect(resolveCityIdentity({ cityName: "Zouérat", regionName: "Tiris Zemmour" }).yalaId).toBe(
    "MR-TZM-ZOU"
  );
  expect(resolveCityIdentity({ cityName: "Sélibaby", regionName: "Guidimakha" }).yalaId).toBe(
    "MR-GDM-SEL"
  );
  expect(normalizeName("Aïoun el-Atrouss")).toBe("aioun el-atrouss");
});

test("Nouakchott is one capital city with three boroughs, not three cities", () => {
  expect(NOUAKCHOTT.capitalCode).toBe("MR-NKC");

  const boroughs = nouakchottBoroughs();
  expect(boroughs.map((b) => b.code)).toEqual(["MR-NKC-N", "MR-NKC-W", "MR-NKC-S"]);
  expect(boroughs.map((b) => b.name)).toEqual([
    "Nouakchott Nord",
    "Nouakchott Ouest",
    "Nouakchott Sud",
  ]);
  boroughs.forEach((b) => {
    expect(b.classification).toBe(CLASSIFICATIONS.borough);
    // Official wilaya classification is preserved on the borough.
    expect(b.regionCode).toBe("NKC");
  });

  const capital = resolveCityIdentity({ cityName: "Nouakchott", regionName: "Nouakchott" });
  expect(capital.yalaId).toBe("MR-NKC");
  expect(capital.classification).toBe(CLASSIFICATIONS.capital);
});

test("legacy city-named regions resolve to their true wilaya and are flagged", () => {
  // These five DB "regions" are city names; they are where the duplicate rows live.
  const cases = [
    ["Atar", "Adrar", "ADR"],
    ["Kaedi", "Gorgol", "GOR"],
    ["Nouadhibou", "Dakhlet Nouadhibou", "DNB"],
    ["Rosso", "Trarza", "TRZ"],
  ];

  cases.forEach(([legacy, wilaya, code]) => {
    const region = resolveRegion(legacy);
    expect(region.wilaya).toBe(wilaya);
    expect(region.regionCode).toBe(code);
    expect(region.isLegacy).toBe(true);
  });

  // A real wilaya is not flagged as legacy.
  expect(resolveRegion("Gorgol").isLegacy).toBe(false);
});

test("the server's own code always wins over a proposal", () => {
  // Adrar/Atar holds code ATR on the server; Adrar/Aoujeft holds nothing.
  const atar = resolveCityIdentity({ cityName: "Atar", regionName: "Adrar", serverCode: "ATR" });
  expect(atar.cityCode).toBe("ATR");
  expect(atar.assigned).toBe(true);

  const aoujeft = resolveCityIdentity({ cityName: "Aoujeft", regionName: "Adrar" });
  expect(aoujeft.cityCode).toBe("AUJ");
  expect(aoujeft.assigned).toBe(false); // a proposal, not a server value
});

test("never invents a code for an unknown city or region", () => {
  const unknown = resolveCityIdentity({ cityName: "Nowhereville", regionName: "Atlantis" });
  expect(unknown.cityCode).toBeNull();
  expect(unknown.yalaId).toBeNull();
  expect(unknown.regionCode).toBeNull();
  expect(unknown.assigned).toBe(false);
});

test("every proposed code is unique within its region and three characters long", () => {
  Object.entries(PROPOSED_CITY_CODES).forEach(([region, towns]) => {
    const codes = Object.values(towns);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((code) => expect(code).toMatch(/^[A-Z]{3}$/));
    // A proposal must never collide with the region's own capital code.
    const wilaya = WILAYAS.find((w) => normalizeName(w.name) === region);
    if (wilaya) expect(codes).not.toContain(wilaya.capitalCode);
  });
});
