/**
 * Nearest Airport Code Lookup
 *
 * Derives the nearest major airport code from a US city + state.
 * Used by the Recruiting module to generate campaign codes (AirportCode + DealerID).
 *
 * Lookup priority:
 *   1. Exact city + state match
 *   2. State-level default
 *   3. Returns null if no mapping found
 */

// ── City → Airport mapping ────────────────────────────────────────────────────
// Key: "city|state" (both lowercased)
const CITY_AIRPORT: Record<string, string> = {
  // ── Texas ───────────────────────────────────────────────────────────────────
  "dallas|tx":          "DFW",
  "fort worth|tx":      "DFW",
  "irving|tx":          "DFW",
  "arlington|tx":       "DFW",
  "garland|tx":         "DFW",
  "plano|tx":           "DFW",
  "frisco|tx":          "DFW",
  "mckinney|tx":        "DFW",
  "richardson|tx":      "DFW",
  "denton|tx":          "DFW",
  "lewisville|tx":      "DFW",
  "carrollton|tx":      "DFW",
  "mesquite|tx":        "DFW",
  "grand prairie|tx":   "DFW",
  "allen|tx":           "DFW",
  "flower mound|tx":    "DFW",
  "euless|tx":          "DFW",
  "bedford|tx":         "DFW",
  "hurst|tx":           "DFW",
  "grapevine|tx":       "DFW",
  "rowlett|tx":         "DFW",
  "duncanville|tx":     "DFW",
  "cedar hill|tx":      "DFW",
  "desoto|tx":          "DFW",
  "mansfield|tx":       "DFW",
  "addison|tx":         "DFW",
  "coppell|tx":         "DFW",
  "southlake|tx":       "DFW",
  "keller|tx":          "DFW",
  "colleyville|tx":     "DFW",
  "waxahachie|tx":      "DFW",
  "rockwall|tx":        "DFW",
  "wylie|tx":           "DFW",
  "murphy|tx":          "DFW",
  "houston|tx":         "IAH",
  "pasadena|tx":        "IAH",
  "pearland|tx":        "IAH",
  "sugar land|tx":      "IAH",
  "katy|tx":            "IAH",
  "the woodlands|tx":   "IAH",
  "conroe|tx":          "IAH",
  "humble|tx":          "IAH",
  "spring|tx":          "IAH",
  "baytown|tx":         "IAH",
  "beaumont|tx":        "BPT",
  "san antonio|tx":     "SAT",
  "new braunfels|tx":   "SAT",
  "schertz|tx":         "SAT",
  "austin|tx":          "AUS",
  "round rock|tx":      "AUS",
  "cedar park|tx":      "AUS",
  "pflugerville|tx":    "AUS",
  "georgetown|tx":      "AUS",
  "kyle|tx":            "AUS",
  "buda|tx":            "AUS",
  "lubbock|tx":         "LBB",
  "amarillo|tx":        "AMA",
  "el paso|tx":         "ELP",
  "midland|tx":         "MAF",
  "odessa|tx":          "MAF",
  "corpus christi|tx":  "CRP",
  "waco|tx":            "ACT",
  "killeen|tx":         "GRK",
  "temple|tx":          "GRK",
  "tyler|tx":           "TYR",
  "longview|tx":        "GGG",
  "abilene|tx":         "ABI",
  "wichita falls|tx":   "SPS",
  "laredo|tx":          "LRD",
  "mcallen|tx":         "MFE",
  "harlingen|tx":       "HRL",
  "brownsville|tx":     "BRO",

  // ── Oklahoma ─────────────────────────────────────────────────────────────────
  "oklahoma city|ok":   "OKC",
  "edmond|ok":          "OKC",
  "norman|ok":          "OKC",
  "moore|ok":           "OKC",
  "midwest city|ok":    "OKC",
  "del city|ok":        "OKC",
  "yukon|ok":           "OKC",
  "mustang|ok":         "OKC",
  "tulsa|ok":           "TUL",
  "broken arrow|ok":    "TUL",
  "owasso|ok":          "TUL",
  "sapulpa|ok":         "TUL",
  "sand springs|ok":    "TUL",
  "bixby|ok":           "TUL",
  "vinita|ok":          "TUL",
  "claremore|ok":       "TUL",
  "muskogee|ok":        "MKO",
  "lawton|ok":          "LAW",

  // ── Oklahoma state abbrev variant ─────────────────────────────────────────────
  "tulsa|oklahoma":     "TUL",
  "broken arrow|oklahoma": "TUL",
  "vinita|oklahoma":    "TUL",

  // ── Florida ───────────────────────────────────────────────────────────────────
  "miami|fl":           "MIA",
  "miami gardens|fl":   "MIA",
  "miami beach|fl":     "MIA",
  "hialeah|fl":         "MIA",
  "homestead|fl":       "MIA",
  "doral|fl":           "MIA",
  "kendall|fl":         "MIA",
  "coral gables|fl":    "MIA",
  "aventura|fl":        "FLL",
  "hollywood|fl":       "FLL",
  "fort lauderdale|fl": "FLL",
  "pembroke pines|fl":  "FLL",
  "miramar|fl":         "FLL",
  "plantation|fl":      "FLL",
  "davie|fl":           "FLL",
  "deerfield beach|fl": "FLL",
  "pompano beach|fl":   "FLL",
  "boca raton|fl":      "PBI",
  "west palm beach|fl": "PBI",
  "boynton beach|fl":   "PBI",
  "lake worth|fl":      "PBI",
  "delray beach|fl":    "PBI",
  "orlando|fl":         "MCO",
  "kissimmee|fl":       "MCO",
  "sanford|fl":         "SFB",
  "tampa|fl":           "TPA",
  "st. petersburg|fl":  "TPA",
  "clearwater|fl":      "TPA",
  "brandon|fl":         "TPA",
  "jacksonville|fl":    "JAX",
  "tallahassee|fl":     "TLH",
  "pensacola|fl":       "PNS",
  "gainesville|fl":     "GNV",
  "fort myers|fl":      "RSW",
  "cape coral|fl":      "RSW",
  "naples|fl":          "APF",
  "sarasota|fl":        "SRQ",

  // ── New York ──────────────────────────────────────────────────────────────────
  "new york|ny":        "JFK",
  "brooklyn|ny":        "JFK",
  "queens|ny":          "JFK",
  "flushing|ny":        "JFK",
  "jamaica|ny":         "JFK",
  "woodside|ny":        "LGA",
  "astoria|ny":         "LGA",
  "long island city|ny": "LGA",
  "jackson heights|ny": "LGA",
  "elmhurst|ny":        "LGA",
  "forest hills|ny":    "JFK",
  "bronx|ny":           "LGA",
  "harlem|ny":          "LGA",
  "manhattan|ny":       "JFK",
  "staten island|ny":   "EWR",
  "west islip|ny":      "ISP",
  "babylon|ny":         "ISP",
  "brentwood|ny":       "ISP",
  "central islip|ny":   "ISP",
  "bay shore|ny":       "ISP",
  "riverhead|ny":       "ISP",
  "smithtown|ny":       "ISP",
  "hauppauge|ny":       "ISP",
  "melville|ny":        "ISP",
  "buffalo|ny":         "BUF",
  "rochester|ny":       "ROC",
  "syracuse|ny":        "SYR",
  "albany|ny":          "ALB",
  "white plains|ny":    "HPN",
  "yonkers|ny":         "LGA",

  // ── New Jersey ────────────────────────────────────────────────────────────────
  "newark|nj":          "EWR",
  "elizabeth|nj":       "EWR",
  "jersey city|nj":     "EWR",
  "hoboken|nj":         "EWR",
  "bayonne|nj":         "EWR",
  "york|nj":            "EWR",
  "union city|nj":      "EWR",
  "paterson|nj":        "EWR",
  "trenton|nj":         "TTN",
  "princeton|nj":       "TTN",
  "atlantic city|nj":   "ACY",

  // ── Illinois ──────────────────────────────────────────────────────────────────
  "chicago|il":         "ORD",
  "naperville|il":      "ORD",
  "aurora|il":          "ORD",
  "joliet|il":          "MDW",
  "orland park|il":     "MDW",
  "tinley park|il":     "MDW",
  "oak lawn|il":        "MDW",
  "bolingbrook|il":     "ORD",
  "schaumburg|il":      "ORD",
  "evanston|il":        "ORD",
  "waukegan|il":        "ORD",
  "elgin|il":           "ORD",
  "rockford|il":        "RFD",
  "springfield|il":     "SPI",
  "peoria|il":          "PIA",

  // ── California ────────────────────────────────────────────────────────────────
  "los angeles|ca":     "LAX",
  "long beach|ca":      "LGB",
  "compton|ca":         "LAX",
  "inglewood|ca":       "LAX",
  "el segundo|ca":      "LAX",
  "hawthorne|ca":       "LAX",
  "torrance|ca":        "LAX",
  "carson|ca":          "LAX",
  "gardena|ca":         "LAX",
  "culver city|ca":     "LAX",
  "santa monica|ca":    "LAX",
  "beverly hills|ca":   "LAX",
  "west hollywood|ca":  "LAX",
  "burbank|ca":         "BUR",
  "glendale|ca":        "BUR",
  "pasadena|ca":        "BUR",
  "san bernardino|ca":  "ONT",
  "ontario|ca":         "ONT",
  "riverside|ca":       "ONT",
  "rancho cucamonga|ca": "ONT",
  "irvine|ca":          "SNA",
  "santa ana|ca":       "SNA",
  "anaheim|ca":         "SNA",
  "orange|ca":          "SNA",
  "costa mesa|ca":      "SNA",
  "fullerton|ca":       "SNA",
  "garden grove|ca":    "SNA",
  "san diego|ca":       "SAN",
  "chula vista|ca":     "SAN",
  "escondido|ca":       "SAN",
  "oceanside|ca":       "SAN",
  "carlsbad|ca":        "SAN",
  "san jose|ca":        "SJC",
  "san francisco|ca":   "SFO",
  "oakland|ca":         "OAK",
  "fremont|ca":         "OAK",
  "hayward|ca":         "OAK",
  "berkeley|ca":        "OAK",
  "sacramento|ca":      "SMF",
  "fresno|ca":          "FAT",
  "bakersfield|ca":     "BFL",
  "san luis obispo|ca": "SBP",
  "santa barbara|ca":   "SBA",

  // ── Arizona ───────────────────────────────────────────────────────────────────
  "phoenix|az":         "PHX",
  "scottsdale|az":      "PHX",
  "tempe|az":           "PHX",
  "chandler|az":        "PHX",
  "gilbert|az":         "PHX",
  "glendale|az":        "PHX",
  "peoria|az":          "PHX",
  "mesa|az":            "PHX",
  "surprise|az":        "PHX",
  "avondale|az":        "PHX",
  "tucson|az":          "TUS",
  "flagstaff|az":       "FLG",

  // ── North Carolina ────────────────────────────────────────────────────────────
  "charlotte|nc":       "CLT",
  "mooresville|nc":     "CLT",
  "concord|nc":         "CLT",
  "gastonia|nc":        "CLT",
  "rock hill|nc":       "CLT",
  "kannapolis|nc":      "CLT",
  "huntersville|nc":    "CLT",
  "matthews|nc":        "CLT",
  "raleigh|nc":         "RDU",
  "durham|nc":          "RDU",
  "chapel hill|nc":     "RDU",
  "cary|nc":            "RDU",
  "greensboro|nc":      "GSO",
  "winston-salem|nc":   "INT",
  "asheville|nc":       "AVL",
  "fayetteville|nc":    "FAY",
  "wilmington|nc":      "ILM",

  // ── Georgia ───────────────────────────────────────────────────────────────────
  "atlanta|ga":         "ATL",
  "marietta|ga":        "ATL",
  "smyrna|ga":          "ATL",
  "roswell|ga":         "ATL",
  "alpharetta|ga":      "ATL",
  "sandy springs|ga":   "ATL",
  "decatur|ga":         "ATL",
  "savannah|ga":        "SAV",
  "augusta|ga":         "AGS",
  "columbus|ga":        "CSG",
  "macon|ga":           "MCN",

  // ── Tennessee ─────────────────────────────────────────────────────────────────
  "nashville|tn":       "BNA",
  "memphis|tn":         "MEM",
  "knoxville|tn":       "TYS",
  "chattanooga|tn":     "CHA",

  // ── Ohio ──────────────────────────────────────────────────────────────────────
  "columbus|oh":        "CMH",
  "cleveland|oh":       "CLE",
  "cincinnati|oh":      "CVG",
  "dayton|oh":          "DAY",
  "toledo|oh":          "TOL",
  "akron|oh":           "CAK",

  // ── Michigan ──────────────────────────────────────────────────────────────────
  "detroit|mi":         "DTW",
  "warren|mi":          "DTW",
  "sterling heights|mi": "DTW",
  "ann arbor|mi":       "DTW",
  "dearborn|mi":        "DTW",
  "grand rapids|mi":    "GRR",
  "lansing|mi":         "LAN",
  "flint|mi":           "FNT",

  // ── Pennsylvania ──────────────────────────────────────────────────────────────
  "philadelphia|pa":    "PHL",
  "pittsburgh|pa":      "PIT",
  "allentown|pa":       "ABE",
  "harrisburg|pa":      "MDT",
  "scranton|pa":        "AVP",

  // ── Virginia ──────────────────────────────────────────────────────────────────
  "virginia beach|va":  "ORF",
  "norfolk|va":         "ORF",
  "richmond|va":        "RIC",
  "arlington|va":       "DCA",
  "alexandria|va":      "DCA",
  "falls church|va":    "DCA",

  // ── Maryland / DC ─────────────────────────────────────────────────────────────
  "washington|dc":      "DCA",
  "baltimore|md":       "BWI",

  // ── Massachusetts ─────────────────────────────────────────────────────────────
  "boston|ma":          "BOS",
  "worcester|ma":       "ORH",
  "springfield|ma":     "BDL",

  // ── Colorado ──────────────────────────────────────────────────────────────────
  "denver|co":          "DEN",
  "aurora|co":          "DEN",
  "colorado springs|co": "COS",

  // ── Nevada ────────────────────────────────────────────────────────────────────
  "las vegas|nv":       "LAS",
  "henderson|nv":       "LAS",
  "reno|nv":            "RNO",

  // ── Washington State ──────────────────────────────────────────────────────────
  "seattle|wa":         "SEA",
  "tacoma|wa":          "SEA",
  "bellevue|wa":        "SEA",
  "spokane|wa":         "GEG",

  // ── Oregon ────────────────────────────────────────────────────────────────────
  "portland|or":        "PDX",

  // ── Minnesota ─────────────────────────────────────────────────────────────────
  "minneapolis|mn":     "MSP",
  "saint paul|mn":      "MSP",
  "st. paul|mn":        "MSP",

  // ── Missouri ──────────────────────────────────────────────────────────────────
  "kansas city|mo":     "MCI",
  "st. louis|mo":       "STL",
  "saint louis|mo":     "STL",
  "springfield|mo":     "SGF",

  // ── Louisiana ─────────────────────────────────────────────────────────────────
  "new orleans|la":     "MSY",
  "baton rouge|la":     "BTR",

  // ── Mississippi ───────────────────────────────────────────────────────────────
  "jackson|ms":         "JAN",

  // ── Alabama ───────────────────────────────────────────────────────────────────
  "birmingham|al":      "BHM",
  "montgomery|al":      "MGM",
  "huntsville|al":      "HSV",
  "mobile|al":          "MOB",

  // ── South Carolina ────────────────────────────────────────────────────────────
  "columbia|sc":        "CAE",
  "charleston|sc":      "CHS",
  "greenville|sc":      "GSP",

  // ── Indiana ───────────────────────────────────────────────────────────────────
  "indianapolis|in":    "IND",
  "fort wayne|in":      "FWA",

  // ── Wisconsin ─────────────────────────────────────────────────────────────────
  "milwaukee|wi":       "MKE",
  "madison|wi":         "MSN",

  // ── Kentucky ──────────────────────────────────────────────────────────────────
  "louisville|ky":      "SDF",
  "lexington|ky":       "LEX",

  // ── Arkansas ──────────────────────────────────────────────────────────────────
  "little rock|ar":     "LIT",
  "fayetteville|ar":    "XNA",

  // ── Utah ──────────────────────────────────────────────────────────────────────
  "salt lake city|ut":  "SLC",
  "provo|ut":           "PVU",
  "ogden|ut":           "OGD",

  // ── New Mexico ────────────────────────────────────────────────────────────────
  "albuquerque|nm":     "ABQ",
  "santa fe|nm":        "SAF",

  // ── Hawaii ────────────────────────────────────────────────────────────────────
  "honolulu|hi":        "HNL",
};

// ── State-level fallback mapping ──────────────────────────────────────────────
const STATE_DEFAULT_AIRPORT: Record<string, string> = {
  "tx": "DFW",
  "ok": "TUL",
  "fl": "MCO",
  "ny": "JFK",
  "nj": "EWR",
  "il": "ORD",
  "ca": "LAX",
  "az": "PHX",
  "nc": "CLT",
  "ga": "ATL",
  "tn": "BNA",
  "oh": "CMH",
  "mi": "DTW",
  "pa": "PHL",
  "va": "DCA",
  "md": "BWI",
  "dc": "DCA",
  "ma": "BOS",
  "co": "DEN",
  "nv": "LAS",
  "wa": "SEA",
  "or": "PDX",
  "mn": "MSP",
  "mo": "STL",
  "la": "MSY",
  "ms": "JAN",
  "al": "BHM",
  "sc": "CAE",
  "in": "IND",
  "wi": "MKE",
  "ky": "SDF",
  "ar": "LIT",
  "ut": "SLC",
  "nm": "ABQ",
  "hi": "HNL",
};

/**
 * Derive the nearest major airport code from city and state.
 * Returns null if neither the city/state combo nor the state is in the mapping.
 */
export function nearestAirportFromAddress(
  city: string | null | undefined,
  state: string | null | undefined,
): string | null {
  if (!city || !state) return null;

  const cityKey  = city.trim().toLowerCase();
  const stateKey = state.trim().toLowerCase();

  // 1. Exact city + state match
  const exactKey = `${cityKey}|${stateKey}`;
  if (CITY_AIRPORT[exactKey]) return CITY_AIRPORT[exactKey];

  // 2. State default
  if (STATE_DEFAULT_AIRPORT[stateKey]) return STATE_DEFAULT_AIRPORT[stateKey];

  return null;
}
