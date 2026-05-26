export const MARKET = {
  brandName: "Sakho Express",
  country: "Mauritania",
  defaultCity: "Nouakchott",
  currency: "MRU",
  ownerCommissionPercent: 30,
  phonePrefix: "+222",
  privateCallNumber: "+22245000001",
  privateCallLabel: "Sakho Express private call",
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
  cities: [
    { label: "Nouakchott", center: [18.0735, -15.9582] },
    { label: "Boutilimit", center: [17.5467, -14.6944] },
    { label: "Wad Naga", center: [17.4581, -15.3336] },
    { label: "Tiguent", center: [17.2358, -16.0269] },
    { label: "Mederdra", center: [16.9214, -15.6581] },
    { label: "Keur Macene", center: [16.5358, -16.2342] },
    { label: "R'Kiz", center: [16.9025, -15.9589] },
    { label: "Akjoujt", center: [19.7464, -14.3853] },
    { label: "Benichab", center: [19.0819, -15.2117] },
    { label: "Mhaijratt", center: [18.7206, -16.0578] },
    { label: "Nouadhibou", center: [20.94188, -17.03842] },
    { label: "Kaedi", center: [16.1503, -13.5037] },
    { label: "Selibaby", center: [15.15846, -12.1843] },
    { label: "Rosso", center: [16.51378, -15.80503] },
  ],
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
    { city: "Nouakchott", label: "Airport", position: [18.3107, -15.9697] },
    { city: "Nouakchott", label: "Carrefour BMD", position: [18.0826, -15.9699] },
    { city: "Nouakchott", label: "Carrefour Madrid", position: [18.0731, -15.9717] },
    { city: "Nouakchott", label: "City Center", position: [18.0798, -15.9650] },
    { city: "Nouakchott", label: "Clinique Chiva", position: [18.0941, -15.9813] },
    { city: "Nouakchott", label: "Hopital National", position: [18.0901, -15.9655] },
    { city: "Nouakchott", label: "Marche Capitale", position: [18.0792, -15.9642] },
    { city: "Nouakchott", label: "Marche Cinquieme", position: [18.0604, -15.9708] },
    { city: "Nouakchott", label: "Mosquee Saoudienne", position: [18.0861, -15.9761] },
    { city: "Nouakchott", label: "PK7", position: [18.0578, -15.9527] },
    { city: "Nouakchott", label: "PK10", position: [18.0433, -15.9362] },
    { city: "Nouakchott", label: "Port de Nouakchott", position: [17.9828, -16.0349] },
    { city: "Nouakchott", label: "Polyclinique", position: [18.0787, -15.9710] },
    { city: "Nouakchott", label: "Route de l'Espoir", position: [18.0505, -15.9346] },
    { city: "Nouakchott", label: "Socogim PS", position: [18.0627, -15.9612] },
    { city: "Nouakchott", label: "Tarhil", position: [18.0048, -15.9098] },
    { city: "Nouakchott", label: "University of Nouakchott", position: [18.1153, -15.9602] },
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
  ],
  fare: {
    regular: { label: "Regular", base: 200, perKm: 20 },
    xl: { label: "XL", base: 300, perKm: 30 },
    comfort: { label: "Comfort", base: 350, perKm: 35 },
    share: { label: "Share", base: 150, perKm: 15 },
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
  })} ${MARKET.currency}`;
}
