/**
 * Countries are stored as ISO 3166-1 alpha-2 codes ("IN", "GB"), not as free
 * text, so that the same country typed three ways still groups as one.
 *
 * Display names come from Intl rather than a hard-coded table: only the codes
 * live here, and the browser or Node supplies the names.
 */

// prettier-ignore
const ISO_ALPHA2 = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
] as const;

export type CountryCode = (typeof ISO_ALPHA2)[number];

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "IN" -> "India". Falls back to the code itself if Intl doesn't know it. */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return displayNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export type CountryOption = { code: CountryCode; name: string };

/** Every country, alphabetical by name — for pickers and datalists. */
export const COUNTRY_OPTIONS: CountryOption[] = ISO_ALPHA2.map((code) => ({
  code,
  name: countryName(code),
})).sort((a, b) => a.name.localeCompare(b.name));

/** Case- and accent-insensitive, punctuation-free comparison key. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Everyday spellings that Intl's canonical names don't cover. A CSV from a
 * client will say "USA" or "UK" far more often than "United States" or
 * "United Kingdom".
 */
const ALIASES: Record<string, CountryCode> = {
  usa: "US",
  unitedstates: "US",
  unitedstatesofamerica: "US",
  america: "US",
  uk: "GB",
  greatbritain: "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  northernireland: "GB",
  uae: "AE",
  emirates: "AE",
  southkorea: "KR",
  northkorea: "KP",
  russia: "RU",
  vietnam: "VN",
  ivorycoast: "CI",
  czechrepublic: "CZ",
  czechia: "CZ",
  turkey: "TR",
  holland: "NL",
  burma: "MM",
  swaziland: "SZ",
  macedonia: "MK",
  capeverde: "CV",
  eastimor: "TL",
  laos: "LA",
  syria: "SY",
  iran: "IR",
  bolivia: "BO",
  tanzania: "TZ",
  venezuela: "VE",
  moldova: "MD",
  brunei: "BN",
  vatican: "VA",
  palestine: "PS",
  drc: "CD",
  congokinshasa: "CD",
  congobrazzaville: "CG",
};

const LOOKUP: Map<string, CountryCode> = (() => {
  const map = new Map<string, CountryCode>();
  for (const code of ISO_ALPHA2) {
    map.set(normalize(code), code);
    const name = countryName(code);
    if (name) map.set(normalize(name), code);
  }
  // Aliases last so they can override nothing important but fill the gaps.
  for (const [alias, code] of Object.entries(ALIASES)) map.set(alias, code);
  return map;
})();

/**
 * Accepts a country name, an alpha-2 code, or a common alias, and returns the
 * canonical alpha-2 code. Returns null for anything unrecognised — callers
 * decide whether that is an error or simply no country.
 *
 * Shared by the client form, the server action and the CSV import, so all
 * three agree on what counts as a country.
 */
export function resolveCountry(input: string | null | undefined): CountryCode | null {
  if (!input) return null;
  const key = normalize(input);
  if (key === "") return null;
  return LOOKUP.get(key) ?? null;
}
