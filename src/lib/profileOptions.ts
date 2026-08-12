// ---------------------------------------------------------------------------
// The option lists behind every business-profile choice.
//
// Onboarding and /profile both edit the same `businesses` row, so they MUST
// offer the same values — otherwise a founder who picks "Beauty & Skincare" at
// signup sees it silently fail to match the profile dropdown later, and the
// stored value can't be recognised. Both screens import from here; nothing
// hardcodes its own list.
//
// These are display labels, stored verbatim as text (the columns are `text`).
// Appending is safe; RENAMING an option orphans every row already storing the
// old label, so add a new one instead.
// ---------------------------------------------------------------------------

export const INDUSTRIES = [
  "Beauty & Skincare",
  "Apparel & Fashion",
  "Health & Wellness",
  "Supplements & Nutrition",
  "Electronics & Gadgets",
  "Home & Garden",
  "Furniture & Interiors",
  "Food & Beverage",
  "Pet Supplies",
  "Baby & Kids",
  "Sports & Outdoors",
  "Jewellery & Accessories",
  "Toys & Games",
  "Automotive & Parts",
  "Arts & Crafts",
  "Digital Products",
  "Other",
] as const;

// Only Shopify is wired up as a connector today. The rest are listed so the
// founder can tell us where they actually sell, but they're marked coming soon
// and can't be selected — picking one would imply a sync we can't perform.
export const CHANNELS: SelectOption[] = [
  { value: "Shopify", label: "Shopify" },
  { value: "Amazon", label: "Amazon (Coming soon)", disabled: true },
  { value: "WooCommerce", label: "WooCommerce (Coming soon)", disabled: true },
  { value: "Etsy", label: "Etsy (Coming soon)", disabled: true },
  { value: "eBay", label: "eBay (Coming soon)", disabled: true },
  {
    value: "Multi-channel",
    label: "Multi-channel (Coming soon)",
    disabled: true,
  },
];

export const BUSINESS_AGES = [
  "Under 12 months",
  "1–2 years",
  "2–3 years",
  "3–5 years",
  "5+ years",
] as const;

export const REVENUE_BRACKETS = [
  "< $10k",
  "$10k–$25k",
  "$25k–$50k",
  "$50k–$100k",
  "$100k–$250k",
  "$250k+",
] as const;

export const EXIT_TIMEFRAMES = [
  "3 months",
  "6 months",
  "12 months",
  "Just exploring",
] as const;

// --- Founder-dependency answers --------------------------------------------
// How much of the business runs through the founder personally is one of the
// first things an acquirer probes, so we ask at onboarding and keep the answers
// editable on /profile.

export const PAID_AD_MANAGERS = [
  "Me",
  "A team member",
  "An agency",
  "No paid ads",
] as const;

export const SUPPLIER_MANAGERS = [
  "Me",
  "A team member",
  "Automated",
  "Not applicable",
] as const;

export const SOP_STATES = ["Yes, fully documented", "Partially", "No"] as const;

export type SelectOption =
  | string
  | { value: string; label?: string; disabled?: boolean };

/** Countries for the "Country of Operation" dropdown. */
export const COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo (Brazzaville)",
  "Congo (Kinshasa)",
  "Costa Rica",
  "Côte d'Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

/**
 * A stored value that predates (or falls outside) a list still has to be
 * selectable, or opening /profile would silently rewrite it to something else.
 * This appends the current value as an extra option when it isn't already one.
 */
export function withCurrentValue(
  options: readonly SelectOption[],
  value: string,
): SelectOption[] {
  const has = options.some((o) =>
    typeof o === "string" ? o === value : o.value === value,
  );
  return has || !value ? [...options] : [...options, value];
}

/**
 * Business age as a number of years, for the rules that care about trading
 * history. The stored values are labels ("Under 12 months", "3–5 years"), so
 * this reads the conservative end of the band: "3–5 years" → 3. Returns null
 * when the value is blank or unrecognised — callers must treat that as unknown
 * rather than assuming a young business.
 */
export function businessAgeYears(age: string): number | null {
  const value = age.trim().toLowerCase();
  if (!value) return null;
  // "Under 12 months" is anything up to a year — take the floor of the band.
  if (value.startsWith("under")) return 0;
  const first = parseFloat(
    value
      .replace(/[^\d.]/g, " ")
      .trim()
      .split(/\s+/)[0],
  );
  if (isNaN(first)) return null;
  return value.includes("month") ? first / 12 : first;
}
