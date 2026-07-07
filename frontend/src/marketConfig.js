import { MAURITANIA_WILAYA_CITIES } from "./data/mauritaniaWilayaCities";

export const MARKET = {
  brandName: "Yala",
  brandTagline: "Ride Anywhere",
  brandTaglineAr: "تنقل أينما كنت",
  brandSlogan: "Fast. Safe. Local.",
  brandColors: {
    green: "#00A651",
    gold: "#D4AF37",
    navy: "#08111F",
    white: "#FFFFFF",
  },
  country: "Mauritania",
  defaultCity: "Nouakchott",
  currency: "MRU",
  ownerCommissionPercent: 30,
  phonePrefix: "+222",
  privateCallNumber: "+22245000001",
  privateCallLabel: "Yala private call",
  serviceBounds: {
    north: 27.5,
    south: 14.4,
    east: -4.5,
    west: -17.5,
  },
  emergencyNumbers: [
    { label: "Police", number: "117", description: "Emergency police" },
    { label: "Ambulance", number: "101", description: "Medical emergency" },
    { label: "Fire", number: "118", description: "Fire emergency" },
  ],
  center: [18.0735, -15.9582],
  cities: MAURITANIA_WILAYA_CITIES.map(({ label, center }) => ({ label, center })),
  defaultPickup: {
    label: "Sebkha",
    position: [18.0735, -15.9582],
  },
  defaultDestination: {
    label: "Toujounine",
    position: [18.0896, -15.9754],
  },
  locations: [
    { city: "Nouakchott", label: "Arafat", position: [18.0466, -15.9657] },
    { city: "Nouakchott", label: "Dar Naim", position: [18.1018, -15.9307] },
    { city: "Nouakchott", label: "El Mina", position: [18.0611, -15.9826] },
    { city: "Nouakchott", label: "Ksar", position: [18.1002, -15.9631] },
    { city: "Nouakchott", label: "Riyadh", position: [18.0259, -15.9565] },
    { city: "Nouakchott", label: "Sebkha", position: [18.0735, -15.9582] },
    { city: "Nouakchott", label: "Teyarett", position: [18.1242, -15.9401] },
    { city: "Nouakchott", label: "Tevragh Zeina", position: [18.1194, -16.0019] },
    { city: "Nouakchott", label: "Toujounine", position: [18.0896, -15.9754] },
    // ── Nouakchott Neighborhoods & Zones ──
    { city: "Nouakchott", label: "Ilot K", position: [18.0892, -15.9712] },
    { city: "Nouakchott", label: "Ilot V", position: [18.0845, -15.9688] },
    { city: "Nouakchott", label: "Ilot T", position: [18.0867, -15.9735] },
    { city: "Nouakchott", label: "Cinquieme", position: [18.0604, -15.9708] },
    { city: "Nouakchott", label: "Sixieme", position: [18.0520, -15.9640] },
    { city: "Nouakchott", label: "Basra", position: [18.0680, -15.9520] },
    { city: "Nouakchott", label: "Socogim Plage", position: [18.0627, -15.9612] },
    { city: "Nouakchott", label: "Socogim Teyarett", position: [18.1180, -15.9450] },
    { city: "Nouakchott", label: "Socogim Ksar", position: [18.0960, -15.9610] },
    { city: "Nouakchott", label: "Dar El Barka", position: [18.0380, -15.9480] },
    { city: "Nouakchott", label: "Bouhdida", position: [18.0550, -15.9750] },
    { city: "Nouakchott", label: "Carrefour Ould Boya", position: [18.0710, -15.9680] },
    { city: "Nouakchott", label: "Hay Saken", position: [18.0950, -15.9520] },
    { city: "Nouakchott", label: "Hay Tarhil", position: [18.0048, -15.9098] },
    { city: "Nouakchott", label: "Kouva", position: [18.0320, -15.9420] },
    { city: "Nouakchott", label: "Nazaha", position: [18.0780, -15.9850] },
    { city: "Nouakchott", label: "Plage des Pecheurs", position: [18.0580, -16.0120] },
    { city: "Nouakchott", label: "Wharf", position: [18.0420, -16.0200] },
    { city: "Nouakchott", label: "Tenweich", position: [18.0350, -15.9700] },
    { city: "Nouakchott", label: "Tivirit", position: [18.0150, -15.9350] },
    { city: "Nouakchott", label: "Saada", position: [18.0680, -15.9900] },
    { city: "Nouakchott", label: "Mellah", position: [18.0750, -15.9950] },
    { city: "Nouakchott", label: "Kebba El Mina", position: [18.0530, -15.9880] },
    { city: "Nouakchott", label: "Kebba Arafat", position: [18.0400, -15.9600] },
    { city: "Nouakchott", label: "Quartier Marocain", position: [18.0920, -15.9780] },
    // ── Nouakchott Key Landmarks ──
    { city: "Nouakchott", label: "Airport Oumtounsy", position: [18.3107, -15.9697] },
    { city: "Nouakchott", label: "Ancien Aeroport", position: [18.0980, -15.9730] },
    { city: "Nouakchott", label: "Gare Routiere", position: [18.0650, -15.9550] },
    { city: "Nouakchott", label: "Stade Olympique", position: [18.1050, -15.9680] },
    { city: "Nouakchott", label: "Palais des Congres", position: [18.1100, -15.9850] },
    { city: "Nouakchott", label: "Presidence", position: [18.1080, -15.9780] },
    { city: "Nouakchott", label: "Assemblee Nationale", position: [18.1020, -15.9700] },
    { city: "Nouakchott", label: "Grande Mosquee", position: [18.0861, -15.9761] },
    { city: "Nouakchott", label: "Mosquee Ibn Abbas", position: [18.0920, -15.9650] },
    { city: "Nouakchott", label: "Mosquee Marocaine", position: [18.1050, -15.9820] },
    // ── Nouakchott Markets & Shopping ──
    { city: "Nouakchott", label: "Marche Capitale", position: [18.0792, -15.9642] },
    { city: "Nouakchott", label: "Marche Cinquieme", position: [18.0604, -15.9708] },
    { city: "Nouakchott", label: "Marche Sixieme", position: [18.0520, -15.9680] },
    { city: "Nouakchott", label: "Marche TVZ", position: [18.1150, -15.9950] },
    { city: "Nouakchott", label: "Marche Sebkha", position: [18.0740, -15.9600] },
    { city: "Nouakchott", label: "Marche Teyarett", position: [18.1200, -15.9420] },
    { city: "Nouakchott", label: "Marche Toujounine", position: [18.0880, -15.9780] },
    { city: "Nouakchott", label: "Centre Commercial Chinguetti", position: [18.0990, -15.9750] },
    // ── Nouakchott Hospitals & Clinics ──
    { city: "Nouakchott", label: "Hopital National", position: [18.0901, -15.9655] },
    { city: "Nouakchott", label: "Hopital Cheikh Zayed", position: [18.1030, -15.9580] },
    { city: "Nouakchott", label: "Clinique Chiva", position: [18.0941, -15.9813] },
    { city: "Nouakchott", label: "Polyclinique", position: [18.0787, -15.9710] },
    { city: "Nouakchott", label: "Hopital Mere Enfant", position: [18.0850, -15.9620] },
    { city: "Nouakchott", label: "Centre Hospitalier Ksar", position: [18.0980, -15.9640] },
    { city: "Nouakchott", label: "Clinique Kissi", position: [18.0920, -15.9720] },
    // ── Nouakchott Education ──
    { city: "Nouakchott", label: "Universite de Nouakchott", position: [18.1153, -15.9602] },
    { city: "Nouakchott", label: "ISCAE", position: [18.1080, -15.9550] },
    { city: "Nouakchott", label: "Lycee National", position: [18.0950, -15.9680] },
    { city: "Nouakchott", label: "Ecole des Mines", position: [18.1020, -15.9520] },
    // ── Nouakchott Hotels & Restaurants ──
    { city: "Nouakchott", label: "Hotel Monotel", position: [18.1060, -15.9900] },
    { city: "Nouakchott", label: "Hotel Marhaba", position: [18.0980, -15.9820] },
    { city: "Nouakchott", label: "Hotel Wissal", position: [18.1020, -15.9880] },
    { city: "Nouakchott", label: "Restaurant Le Boukarou", position: [18.1100, -15.9920] },
    // ── Nouakchott Roads & Intersections ──
    { city: "Nouakchott", label: "Carrefour BMD", position: [18.0826, -15.9699] },
    { city: "Nouakchott", label: "Carrefour Madrid", position: [18.0731, -15.9717] },
    { city: "Nouakchott", label: "Carrefour Palais", position: [18.1070, -15.9760] },
    { city: "Nouakchott", label: "Carrefour Teyarett", position: [18.1200, -15.9480] },
    { city: "Nouakchott", label: "PK7", position: [18.0578, -15.9527] },
    { city: "Nouakchott", label: "PK10", position: [18.0433, -15.9362] },
    { city: "Nouakchott", label: "PK13", position: [18.0280, -15.9180] },
    { city: "Nouakchott", label: "PK17", position: [18.0100, -15.8950] },
    { city: "Nouakchott", label: "Route de l'Espoir", position: [18.0505, -15.9346] },
    { city: "Nouakchott", label: "Route de Nouadhibou", position: [18.1400, -15.9500] },
    { city: "Nouakchott", label: "Route de Rosso", position: [18.0200, -15.9700] },
    { city: "Nouakchott", label: "Route de l'Ambassade", position: [18.1100, -15.9950] },
    { city: "Nouakchott", label: "Corniche", position: [18.0900, -16.0100] },
    // ── Nouakchott Port & Industrial ──
    { city: "Nouakchott", label: "Port de Nouakchott", position: [17.9828, -16.0349] },
    { city: "Nouakchott", label: "Port de Peche", position: [18.0550, -16.0150] },
    { city: "Nouakchott", label: "Zone Industrielle", position: [18.0350, -15.9250] },
    { city: "Nouakchott", label: "SOMELEC", position: [18.0800, -15.9580] },
    { city: "Nouakchott", label: "SNDE", position: [18.0850, -15.9550] },
    { city: "Boutilimit", label: "Boutilimit Center", position: [17.5467, -14.6944] },
    { city: "Boutilimit", label: "Boutilimit Market", position: [17.5488, -14.6919] },
    { city: "Boutilimit", label: "Boutilimit Bus Station", position: [17.5435, -14.6991] },
    { city: "Wad Naga", label: "Wad Naga Center", position: [17.4581, -15.3336] },
    { city: "Wad Naga", label: "Wad Naga Market", position: [17.4617, -15.3353] },
    { city: "Wad Naga", label: "Wad Naga Road Stop", position: [17.4544, -15.3274] },
    { city: "Tiguent", label: "Tiguent Center", position: [17.2358, -16.0269] },
    { city: "Tiguent", label: "Tiguent Market", position: [17.2381, -16.0229] },
    { city: "Tiguent", label: "Tiguent Road Stop", position: [17.2322, -16.0313] },
    { city: "Mederdra", label: "Mederdra Center", position: [16.9214, -15.6581] },
    { city: "Mederdra", label: "Mederdra Market", position: [16.9234, -15.6552] },
    { city: "Mederdra", label: "Mederdra Road Stop", position: [16.9181, -15.6617] },
    { city: "Keur Macene", label: "Keur Macene Center", position: [16.5358, -16.2342] },
    { city: "Keur Macene", label: "Keur Macene Market", position: [16.5379, -16.2309] },
    { city: "R'Kiz", label: "R'Kiz Center", position: [16.9025, -15.9589] },
    { city: "R'Kiz", label: "R'Kiz Market", position: [16.9045, -15.9553] },
    { city: "Akjoujt", label: "Akjoujt Center", position: [19.7464, -14.3853] },
    { city: "Akjoujt", label: "Akjoujt Market", position: [19.7485, -14.3823] },
    { city: "Benichab", label: "Benichab Center", position: [19.0819, -15.2117] },
    { city: "Benichab", label: "Benichab Road Stop", position: [19.0786, -15.2162] },
    { city: "Mhaijratt", label: "Mhaijratt Center", position: [18.7206, -16.0578] },
    { city: "Mhaijratt", label: "Mhaijratt Road Stop", position: [18.7167, -16.0619] },
    { city: "Nouadhibou", label: "Nouadhibou Center", position: [20.94188, -17.03842] },
    { city: "Nouadhibou", label: "Cansado", position: [20.9172, -17.0487] },
    { city: "Nouadhibou", label: "Port Autonome Nouadhibou", position: [20.9086, -17.0504] },
    { city: "Nouadhibou", label: "Nouadhibou Airport", position: [20.9331, -17.0299] },
    { city: "Kaedi", label: "Kaedi Center", position: [16.1503, -13.5037] },
    { city: "Kaedi", label: "Kaedi Hospital", position: [16.1516, -13.5092] },
    { city: "Kaedi", label: "Gorgol River Area", position: [16.1419, -13.5054] },
    { city: "Kaedi", label: "Kaedi Market", position: [16.1492, -13.5006] },
    { city: "Selibaby", label: "Selibaby Center", position: [15.15846, -12.1843] },
    { city: "Selibaby", label: "Selibaby Hospital", position: [15.1547, -12.1859] },
    { city: "Selibaby", label: "Selibaby Market", position: [15.1602, -12.1818] },
    { city: "Selibaby", label: "Selibaby Airport", position: [15.1822, -12.2061] },
    { city: "Rosso", label: "Rosso Center", position: [16.51378, -15.80503] },
    { city: "Rosso", label: "Rosso Market", position: [16.5161, -15.8019] },
    { city: "Rosso", label: "Rosso Ferry", position: [16.5008, -15.8132] },
    { city: "Rosso", label: "Rosso Hospital", position: [16.5204, -15.8081] },
    // ── Kiffa ──
    { city: "Kiffa", label: "Kiffa Center", position: [16.6166, -11.4042] },
    { city: "Kiffa", label: "Kiffa Market", position: [16.6190, -11.4010] },
    { city: "Kiffa", label: "Kiffa Hospital", position: [16.6140, -11.4080] },
    { city: "Kiffa", label: "Kiffa Gare Routiere", position: [16.6200, -11.3980] },
    // ── Zouerate ──
    { city: "Zouerate", label: "Zouerate Center", position: [22.7354, -12.4783] },
    { city: "Zouerate", label: "Zouerate Market", position: [22.7380, -12.4750] },
    { city: "Zouerate", label: "Zouerate Gare SNIM", position: [22.7320, -12.4820] },
    // ── Atar ──
    { city: "Atar", label: "Atar Center", position: [20.5169, -13.0489] },
    { city: "Atar", label: "Atar Market", position: [20.5190, -13.0460] },
    { city: "Atar", label: "Atar Airport", position: [20.5067, -13.0431] },
    { city: "Atar", label: "Atar Hospital", position: [20.5150, -13.0510] },
    // ── Nema ──
    { city: "Nema", label: "Nema Center", position: [16.6160, -7.2565] },
    { city: "Nema", label: "Nema Market", position: [16.6180, -7.2540] },
    { city: "Nema", label: "Nema Airport", position: [16.6220, -7.2600] },
    // ── Aioun el Atrouss ──
    { city: "Aioun el Atrouss", label: "Aioun Center", position: [16.6614, -9.6149] },
    { city: "Aioun el Atrouss", label: "Aioun Market", position: [16.6640, -9.6120] },
    { city: "Aioun el Atrouss", label: "Aioun Hospital", position: [16.6590, -9.6180] },
    { city: "Aioun el Atrouss", label: "Aioun Airport", position: [16.7110, -9.6380] },
    // ── Tidjikja ──
    { city: "Tidjikja", label: "Tidjikja Center", position: [18.5564, -11.4272] },
    { city: "Tidjikja", label: "Tidjikja Market", position: [18.5590, -11.4250] },
    { city: "Tidjikja", label: "Tidjikja Airport", position: [18.5700, -11.4230] },
    // ── Aleg ──
    { city: "Aleg", label: "Aleg Center", position: [17.0528, -13.9089] },
    { city: "Aleg", label: "Aleg Market", position: [17.0550, -13.9060] },
    { city: "Aleg", label: "Aleg Hospital", position: [17.0500, -13.9120] },
    { city: "Aleg", label: "Aleg Gare Routiere", position: [17.0570, -13.9040] },
    // ── Maghama ──
    { city: "Maghama", label: "Maghama Center", position: [15.5101, -12.8510] },
    { city: "Maghama", label: "Maghama Market", position: [15.5120, -12.8480] },
    { city: "Maghama", label: "Maghama Hospital", position: [15.5080, -12.8540] },
    { city: "Maghama", label: "Maghama Gare Routiere", position: [15.5140, -12.8460] },
    { city: "Maghama", label: "Maghama Mosque", position: [15.5110, -12.8500] },
    // ── Toulel ──
    { city: "Toulel", label: "Toulel Village", position: [15.4850, -12.8200] },
    { city: "Toulel", label: "Toulel Mosque", position: [15.4855, -12.8190] },
    { city: "Toulel", label: "Toulel School", position: [15.4845, -12.8210] },
    { city: "Toulel", label: "Toulel Market", position: [15.4860, -12.8180] },
    { city: "Toulel", label: "Toulel Road Stop", position: [15.4870, -12.8160] },
  ],
  fare: {
    regular: { label: "Regular", base: 200, perKm: 20 },
    xl: { label: "XL", base: 300, perKm: 30 },
    comfort: { label: "Comfort", base: 350, perKm: 35 },
    share: { label: "Share", base: 150, perKm: 15 },
  },
  waiting: {
    freeMinutes: 3,
    perMinuteFee: 50,
  },
};

export function getLocationsByCity(city) {
  return MARKET.locations.filter((location) => location.city === city);
}

export function getLocationByLabel(label, city) {
  const normalized = String(label || "").trim().toLowerCase();
  return MARKET.locations.find(
    (location) =>
      location.label.toLowerCase() === normalized &&
      (!city || location.city === city)
  );
}

export function calculateDistanceKm(fromPosition, toPosition) {
  if (!fromPosition || !toPosition) return null;

  const [fromLat, fromLng] = fromPosition.map(Number);
  const [toLat, toLng] = toPosition.map(Number);

  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) return null;

  const earthRadiusKm = 6371;
  const latDelta = ((toLat - fromLat) * Math.PI) / 180;
  const lngDelta = ((toLng - fromLng) * Math.PI) / 180;
  const startLat = (fromLat * Math.PI) / 180;
  const endLat = (toLat * Math.PI) / 180;

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);

  const distance = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round(distance * 10) / 10);
}

export function isPointInServiceArea(point) {
  if (!point) return false;

  const [lat, lng] = point.map(Number);

  if ([lat, lng].some(Number.isNaN)) return false;

  const { north, south, east, west } = MARKET.serviceBounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

export function calculateFare(rideType, distanceKm) {
  const pricing = MARKET.fare[rideType] || MARKET.fare.regular;
  const distance = Number(distanceKm || 0);
  return Math.round((pricing.base + distance * pricing.perKm) * 100) / 100;
}

export function formatMoney(amount) {
  const value = Number(amount || 0);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${MARKET.currency || "MRU"}`;
}
