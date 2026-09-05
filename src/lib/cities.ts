// Obszar działania marek własnych Sunrise (decyzja właściciela 2026-09-06): promień 200 km od Nowego Tomyśla.
// Lista = market.service_cities (ta sama kolejność: od najbliższych). Używana przez strony miast /oze/<slug>, stopkę,
// stronę główną i api/miasto.ts (HTML dla robotów) oraz api/sitemap.ts.
export type City = { slug: string; name: string; region: string; lat: number; lon: number; km: number };
export const BASE_CITY = { name: "Nowy Tomyśl", lat: 52.3181, lon: 16.1283 };
export const SERVICE_RADIUS_KM = 200;
export const CITIES: City[] = [
  { slug: "nowy-tomysl", name: "Nowy Tomyśl", region: "wielkopolskie", lat: 52.3181, lon: 16.1283, km: 0 },
  { slug: "grodzisk-wielkopolski", name: "Grodzisk Wielkopolski", region: "wielkopolskie", lat: 52.227, lon: 16.364, km: 19 },
  { slug: "wolsztyn", name: "Wolsztyn", region: "wielkopolskie", lat: 52.117, lon: 16.115, km: 22 },
  { slug: "miedzyrzecz", name: "Międzyrzecz", region: "lubuskie", lat: 52.4447, lon: 15.5787, km: 40 },
  { slug: "swiebodzin", name: "Świebodzin", region: "lubuskie", lat: 52.2477, lon: 15.533, km: 41 },
  { slug: "koscian", name: "Kościan", region: "wielkopolskie", lat: 52.087, lon: 16.644, km: 44 },
  { slug: "szamotuly", name: "Szamotuły", region: "wielkopolskie", lat: 52.612, lon: 16.582, km: 45 },
  { slug: "poznan", name: "Poznań", region: "wielkopolskie", lat: 52.4064, lon: 16.9252, km: 55 },
  { slug: "zielona-gora", name: "Zielona Góra", region: "lubuskie", lat: 51.9356, lon: 15.5062, km: 60 },
  { slug: "leszno", name: "Leszno", region: "wielkopolskie", lat: 51.8418, lon: 16.575, km: 61 },
  { slug: "nowa-sol", name: "Nowa Sól", region: "lubuskie", lat: 51.803, lon: 15.717, km: 64 },
  { slug: "srem", name: "Śrem", region: "wielkopolskie", lat: 52.0885, lon: 17.015, km: 66 },
  { slug: "glogow", name: "Głogów", region: "dolnośląskie", lat: 51.6636, lon: 16.0845, km: 73 },
  { slug: "gorzow-wielkopolski", name: "Gorzów Wielkopolski", region: "lubuskie", lat: 52.7368, lon: 15.2288, km: 77 },
  { slug: "pila", name: "Piła", region: "wielkopolskie", lat: 53.151, lon: 16.738, km: 101 },
  { slug: "zary", name: "Żary", region: "lubuskie", lat: 51.642, lon: 15.137, km: 101 },
  { slug: "gniezno", name: "Gniezno", region: "wielkopolskie", lat: 52.5349, lon: 17.5826, km: 102 },
  { slug: "lubin", name: "Lubin", region: "dolnośląskie", lat: 51.4, lon: 16.201, km: 102 },
  { slug: "legnica", name: "Legnica", region: "dolnośląskie", lat: 51.207, lon: 16.1553, km: 124 },
  { slug: "ostrow-wielkopolski", name: "Ostrów Wielkopolski", region: "wielkopolskie", lat: 51.6549, lon: 17.8104, km: 137 },
  { slug: "konin", name: "Konin", region: "wielkopolskie", lat: 52.223, lon: 18.2512, km: 145 },
  { slug: "wroclaw", name: "Wrocław", region: "dolnośląskie", lat: 51.1079, lon: 17.0385, km: 148 },
  { slug: "kalisz", name: "Kalisz", region: "wielkopolskie", lat: 51.7611, lon: 18.091, km: 148 },
  { slug: "inowroclaw", name: "Inowrocław", region: "kujawsko-pomorskie", lat: 52.798, lon: 18.261, km: 154 },
  { slug: "bydgoszcz", name: "Bydgoszcz", region: "kujawsko-pomorskie", lat: 53.1235, lon: 18.0084, km: 155 },
  { slug: "szczecin", name: "Szczecin", region: "zachodniopomorskie", lat: 53.4285, lon: 14.5528, km: 163 },
  { slug: "torun", name: "Toruń", region: "kujawsko-pomorskie", lat: 53.0138, lon: 18.5984, km: 184 }
];
export const SERVICE_REGIONS = Array.from(new Set(CITIES.map((c) => c.region)));
export function cityBySlug(slug: string): City | undefined { return CITIES.find((c) => c.slug === slug); }
/** Miejscownik dla nagłówków: „w Poznaniu”. Uproszczona odmiana + wyjątki. */
const LOC: Record<string, string> = { "Poznań": "Poznaniu", "Zielona Góra": "Zielonej Górze", "Gorzów Wielkopolski": "Gorzowie Wielkopolskim", "Leszno": "Lesznie", "Wrocław": "Wrocławiu", "Bydgoszcz": "Bydgoszczy", "Toruń": "Toruniu", "Szczecin": "Szczecinie", "Kalisz": "Kaliszu", "Konin": "Koninie", "Piła": "Pile", "Legnica": "Legnicy", "Głogów": "Głogowie", "Gniezno": "Gnieźnie", "Ostrów Wielkopolski": "Ostrowie Wielkopolskim", "Świebodzin": "Świebodzinie", "Nowy Tomyśl": "Nowym Tomyślu", "Grodzisk Wielkopolski": "Grodzisku Wielkopolskim", "Wolsztyn": "Wolsztynie", "Międzyrzecz": "Międzyrzeczu", "Szamotuły": "Szamotułach", "Śrem": "Śremie", "Kościan": "Kościanie", "Lubin": "Lubinie", "Nowa Sól": "Nowej Soli", "Żary": "Żarach", "Inowrocław": "Inowrocławiu" };
export function inCity(name: string) { return `w ${LOC[name] ?? name}`; }
