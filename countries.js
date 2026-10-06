// Rough centre and radius (km) per country. Used to catch coordinates that are nowhere
// near the country the AI claims. Deliberately generous: it only has to catch big mistakes.
const RAW = {
  "united states": [39, -98, 3300], "canada": [56, -100, 3500], "mexico": [23, -102, 1700],
  "guatemala": [15.5, -90.3, 300], "honduras": [14.8, -86.6, 300], "nicaragua": [12.9, -85, 300],
  "costa rica": [10, -84, 250], "panama": [8.5, -80, 350], "dominican republic": [18.9, -70.5, 300],
  "jamaica": [18.1, -77.3, 150], "cuba": [21.5, -79.5, 650],
  "colombia": [4, -73, 900], "venezuela": [7, -66, 900], "ecuador": [-1.5, -78.5, 500],
  "peru": [-10, -75, 1000], "bolivia": [-17, -65, 900], "brazil": [-10, -52, 2700],
  "paraguay": [-23, -58, 600], "uruguay": [-33, -56, 400], "argentina": [-38, -64, 2200],
  "chile": [-35, -71, 2500],
  "united kingdom": [54, -2.5, 650], "ireland": [53.3, -8, 250], "france": [46.6, 2.5, 650],
  "spain": [40, -3.7, 750], "portugal": [39.5, -8, 350], "italy": [42.8, 12.5, 700],
  "germany": [51, 10, 500], "netherlands": [52.2, 5.3, 200], "belgium": [50.6, 4.7, 200],
  "switzerland": [46.8, 8.2, 200], "austria": [47.5, 14.5, 300], "poland": [52, 19, 450],
  "czechia": [49.8, 15.5, 250], "greece": [39, 22, 500], "sweden": [62, 15, 900],
  "norway": [64, 11, 1200], "finland": [64, 26, 800], "denmark": [56, 10, 300],
  "estonia": [58.7, 25.5, 250], "latvia": [56.9, 24.9, 250], "lithuania": [55.3, 23.9, 250],
  "ukraine": [49, 32, 700], "romania": [46, 25, 450], "hungary": [47, 19.5, 300],
  "bulgaria": [42.7, 25.5, 350], "serbia": [44, 21, 300], "croatia": [45.1, 15.5, 350],
  "turkey": [39, 35, 1000], "russia": [60, 90, 5000], "kazakhstan": [48, 67, 1800],
  "uzbekistan": [41.5, 64, 800], "israel": [31.5, 35, 250], "saudi arabia": [24, 45, 1300],
  "united arab emirates": [24, 54, 300], "oman": [21, 57, 600], "iran": [32, 53, 1200],
  "egypt": [26.8, 30.8, 700], "morocco": [31.8, -7, 800], "algeria": [28, 3, 1200],
  "tunisia": [34, 9, 350], "senegal": [14.5, -14.5, 400], "ivory coast": [7.5, -5.5, 500],
  "ghana": [7.9, -1, 450], "nigeria": [9, 8, 800], "ethiopia": [9, 40, 900],
  "kenya": [0.2, 38, 700], "uganda": [1.4, 32.3, 450], "tanzania": [-6.4, 34.9, 900],
  "south africa": [-29, 25, 1100],
  "india": [22, 79, 1900], "pakistan": [30, 70, 1000], "bangladesh": [23.7, 90.3, 300],
  "sri lanka": [7.8, 80.7, 250], "china": [35, 103, 2800], "hong kong": [22.3, 114.2, 60],
  "taiwan": [23.7, 121, 250], "japan": [36, 138, 1400], "south korea": [36.5, 127.8, 350],
  "vietnam": [16, 106, 1000], "thailand": [15, 101, 850], "cambodia": [12.5, 105, 350],
  "laos": [18, 103, 600], "myanmar": [21, 96, 900], "malaysia": [4, 102, 800],
  "singapore": [1.35, 103.8, 50], "indonesia": [-2, 118, 2500], "philippines": [12, 122, 1000],
  "australia": [-25, 134, 2600], "new zealand": [-41, 174, 1300],
};
const ALIASES = {
  "usa": "united states", "us": "united states", "united states of america": "united states",
  "uk": "united kingdom", "great britain": "united kingdom", "england": "united kingdom",
  "scotland": "united kingdom", "czech republic": "czechia", "korea": "south korea",
  "republic of korea": "south korea", "cote d'ivoire": "ivory coast", "côte d'ivoire": "ivory coast",
  "uae": "united arab emirates", "viet nam": "vietnam", "türkiye": "turkey", "turkiye": "turkey",
};
export function normCountry(name) {
  const n = String(name || "").trim().toLowerCase();
  return ALIASES[n] || n;
}
export function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
/** true = plausible, false = clearly wrong, null = country not in the table (cannot tell). */
export function coordsMatchCountry(country, lat, lng) {
  const c = RAW[normCountry(country)];
  if (!c) return null;
  return distanceKm(lat, lng, c[0], c[1]) <= c[2];
}
export function countryCentre(country) {
  const c = RAW[normCountry(country)];
  return c ? { lat: c[0], lng: c[1] } : null;
}
