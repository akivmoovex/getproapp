/**
 * Generates public/data/search-lists.json — Zambia district seats + notable places,
 * and professional service labels for autocomplete.
 */
const fs = require("fs");
const path = require("path");

const districts = `Chibombo,Chisamba,Chitambo,Kabwe,Kapiri Mposhi,Luano,Mkushi,Mumbwa,Ngabwe,Serenje,Shibuyunji,Chililabombwe,Chingola,Kalulushi,Kitwe,Luanshya,Lufwanyama,Masaiti,Mpongwe,Mufulira,Ndola,Chadiza,Chama,Chasefu,Chipangali,Chipata,Kasenengwa,Katete,Lumezi,Lundazi,Lusangazi,Mambwe,Nyimba,Petauke,Sinda,Vubwi,Chembe,Chiengi,Chifunabuli,Chipili,Kawambwa,Lunga,Mansa,Milenge,Mwansabombwe,Mwense,Nchelenge,Samfya,Chilanga,Chongwe,Kafue,Luangwa,Lusaka,Rufunsa,Chinsali,Isoka,Kanchibiya,Lavushimanda,Mafinga,Mpika,Nakonde,Shiwang'andu,Chilubi,Kaputa,Kasama,Lunte,Lupososhi,Luwingu,Mbala,Mporokoso,Mpulungu,Mungwi,Nsama,Senga,Chavuma,Ikelenge,Kabompo,Kasempa,Kalumbila,Manyinga,Mufumbwe,Mushindamo,Mwinilunga,Solwezi,Zambezi,Chikankata,Chirundu,Choma,Gwembe,Itezhi-Tezhi,Kalomo,Kazungula,Livingstone,Mazabuka,Monze,Namwala,Pemba,Siavonga,Sinazongwe,Zimba,Kalabo,Kaoma,Limulunga,Luampa,Lukulu,Mitete,Mongu,Mulobezi,Mwandi,Nalolo,Nkeyema,Senanga,Sesheke,Shang'ombo,Sikongo,Sioma`.split(
  ","
);

const extraPlaces = `Chambishi,Chilonga,Chinyingi,Chozi,Imwambo,Kafulwe,Kalene Hill,Kanyembo,Kashikishi,Kataba,Lilundu,Macha Mission,Makono,Mbereshi,Mfuwe,Muyombe,Mulumbo,Namayula,Nandopu,Nanikelako,Ngoma,Nseluka,Sikalongo,Sinazeze,Shiwa Ngandu`.split(
  ","
);

const services = [
  "Electrician",
  "Plumber",
  "Carpenter",
  "Welder",
  "Gardener",
  "Painter",
  "Roofer",
  "HVAC technician",
  "Mason",
  "Tiler",
  "Locksmith",
  "Glazier",
  "Mechanic",
  "Auto electrician",
  "Builder",
  "Handyman",
  "Landscaper",
  "Cleaner",
  "Pest control",
  "Drywall installer",
  "Plasterer",
  "Surveyor",
  "Architect",
  "Civil engineer",
  "Industrial electrician",
  "Solar installer",
  "Security systems",
  "CCTV installer",
  "Fencing contractor",
  "Flooring installer",
  "Decorator",
  "Plumber (drainage)",
  "Scaffolder",
  "Steel fixer",
  "Insulation installer",
  "Gas fitter",
  "Excavation contractor",
  "Demolition contractor",
  "Waterproofing specialist",
  "Accountant",
  "Tax Consultant",
  "Lawyer",
  "Lawyer (Criminal)",
  "Lawyer (Family)"
];

const seen = new Set();
const cities = [];
for (const c of [...districts, ...extraPlaces]) {
  const t = c.trim();
  if (!t) continue;
  const k = t.toLowerCase();
  if (!seen.has(k)) {
    seen.add(k);
    cities.push(t);
  }
}
cities.sort((a, b) => a.localeCompare(b, "en"));

const out = {
  services: [...new Set(services)].sort((a, b) => a.localeCompare(b, "en")),
  cities,
};

const dest = path.join(__dirname, "../public/data/search-lists.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");
// eslint-disable-next-line no-console
console.log(`Wrote ${dest} (${out.cities.length} cities, ${out.services.length} services)`);
