/**
 * Utility functions and presets for Product Variants (Sizes & Colors)
 */

export interface ParsedColor {
  name: string;
  hex: string;
  isLight: boolean;
  hasExplicitHex: boolean;
}

// Comprehensive mapping of common color names to authentic hex codes
export const NAMED_COLOR_MAP: Record<string, string> = {
  black: '#0f172a',
  jetblack: '#000000',
  white: '#ffffff',
  offwhite: '#fafafa',
  navy: '#1e3a8a',
  navyblue: '#1e3a8a',
  blue: '#2563eb',
  royal: '#1d4ed8',
  royalblue: '#1d4ed8',
  skyblue: '#0ea5e9',
  lightblue: '#7dd3fc',
  cyan: '#06b6d4',
  teal: '#0d9488',
  green: '#16a34a',
  forestgreen: '#15803d',
  emerald: '#10b981',
  olive: '#65a30d',
  olivegreen: '#4d7c0f',
  mint: '#6ee7b7',
  red: '#dc2626',
  crimson: '#b91c1c',
  maroon: '#800000',
  burgundy: '#800020',
  wine: '#722f37',
  rose: '#f43f5e',
  rosegold: '#fb7185',
  pink: '#ec4899',
  hotpink: '#db2777',
  coral: '#fb923c',
  orange: '#ea580c',
  amber: '#d97706',
  yellow: '#eab308',
  gold: '#ca8a04',
  golden: '#eab308',
  brown: '#78350f',
  chocolate: '#5a2e12',
  tan: '#d97706',
  beige: '#d4b996',
  khaki: '#c3b091',
  silver: '#94a3b8',
  gray: '#64748b',
  grey: '#64748b',
  lightgray: '#cbd5e1',
  darkgray: '#475569',
  charcoal: '#334155',
  spacegray: '#4b5563',
  purple: '#8b5cf6',
  violet: '#7c3aed',
  indigo: '#4f46e5',
  lavender: '#c084fc',
  bronze: '#cd7f32',
  copper: '#b87333',
  cream: '#fffdd0',
  peach: '#ffcba4',
  turquoise: '#40e0d0',
};

/**
 * Determine if a hex color is light (needs a border or dark text for visibility)
 */
export function isColorLight(hexInput: string): boolean {
  if (!hexInput) return false;
  let hex = hexInput.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return false;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // HSP (Highly Sensitive Poo) equation from DZone
  const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  return hsp > 185;
}

/**
 * Parse any stored color string into display name and specific color hex
 * Supports:
 * - "Navy Blue|#1e3a8a"
 * - "Navy Blue (#1e3a8a)"
 * - "Navy Blue" (matches against NAMED_COLOR_MAP)
 * - "#1e3a8a"
 */
export function parseColorOption(rawColor: string | undefined | null): ParsedColor {
  if (!rawColor || typeof rawColor !== 'string') {
    return { name: '', hex: '#94a3b8', isLight: false, hasExplicitHex: false };
  }

  const trimmed = rawColor.trim();

  // Pattern 1: Delimited with pipe "Color Name|#hex"
  if (trimmed.includes('|')) {
    const [namePart, hexPart] = trimmed.split('|').map((s) => s.trim());
    const validHex = normalizeHex(hexPart);
    if (validHex) {
      return {
        name: namePart || validHex,
        hex: validHex,
        isLight: isColorLight(validHex),
        hasExplicitHex: true,
      };
    }
  }

  // Pattern 2: "Color Name (#hex)" or "Color Name (#hex)"
  const parenMatch = trimmed.match(/^(.+?)\s*\(\s*(#[0-9a-fA-F]{3,8})\s*\)$/);
  if (parenMatch) {
    const name = parenMatch[1].trim();
    const hex = normalizeHex(parenMatch[2]);
    if (hex) {
      return {
        name,
        hex,
        isLight: isColorLight(hex),
        hasExplicitHex: true,
      };
    }
  }

  // Pattern 3: Pure Hex (e.g. "#ff0000")
  const pureHex = normalizeHex(trimmed);
  if (pureHex) {
    return {
      name: trimmed,
      hex: pureHex,
      isLight: isColorLight(pureHex),
      hasExplicitHex: true,
    };
  }

  // Pattern 4: Named color lookup
  const normalizedKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedHex = NAMED_COLOR_MAP[normalizedKey];
  if (matchedHex) {
    return {
      name: trimmed,
      hex: matchedHex,
      isLight: isColorLight(matchedHex),
      hasExplicitHex: true,
    };
  }

  // Pattern 5: Look for any known color word in compound strings (e.g. "Crimson Red", "Dark Blue", "Warm White")
  const words = trimmed.toLowerCase().split(/[\s\-_]+/);
  for (const w of words) {
    const cleanWord = w.replace(/[^a-z0-9]/g, '');
    if (NAMED_COLOR_MAP[cleanWord]) {
      const foundHex = NAMED_COLOR_MAP[cleanWord];
      return {
        name: trimmed,
        hex: foundHex,
        isLight: isColorLight(foundHex),
        hasExplicitHex: true,
      };
    }
  }

  // Fallback: Default to a modern neutral slate accent if unrecognized
  return {
    name: trimmed,
    hex: '#64748b',
    isLight: false,
    hasExplicitHex: false,
  };
}

/**
 * Format a color option for saving
 * If displaySpecificColor is true or a valid hex is provided, serializes as "Name|#hex"
 */
export function formatColorOption(name: string, hex?: string, displaySpecificColor: boolean = true): string {
  const cleanName = name.trim();
  if (!cleanName) return '';

  if (displaySpecificColor && hex) {
    const validHex = normalizeHex(hex);
    if (validHex) {
      return `${cleanName}|${validHex}`;
    }
  }

  // If user entered hex directly in the name
  const existingHex = normalizeHex(cleanName);
  if (existingHex) {
    return existingHex;
  }

  return cleanName;
}

/**
 * Validate and normalize hex strings
 */
export function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null;
  let hex = input.trim();
  if (!hex.startsWith('#')) {
    hex = '#' + hex;
  }
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    return hex.toLowerCase();
  }
  return null;
}

/**
 * Quick popular color palettes for one-click selection
 */
export const POPULAR_COLOR_PALETTES: Array<{ name: string; hex: string }> = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Sky Blue', hex: '#0ea5e9' },
  { name: 'Forest Green', hex: '#15803d' },
  { name: 'Olive Green', hex: '#4d7c0f' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Crimson', hex: '#991b1b' },
  { name: 'Burgundy', hex: '#800020' },
  { name: 'Rose Gold', hex: '#fb7185' },
  { name: 'Gold', hex: '#eab308' },
  { name: 'Silver', hex: '#94a3b8' },
  { name: 'Charcoal', hex: '#334155' },
  { name: 'Brown', hex: '#78350f' },
  { name: 'Beige', hex: '#d4b996' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
];

/**
 * Presets for numerical product sizes
 */
export const NUMERICAL_SIZE_PRESETS = {
  shoes: {
    label: 'Shoe Sizes (EU)',
    values: ['38', '39', '40', '41', '42', '43', '44', '45', '46'],
  },
  waist: {
    label: 'Waist / Pants (Inches)',
    values: ['28', '30', '32', '34', '36', '38', '40'],
  },
  rings: {
    label: 'Ring Sizes',
    values: ['16', '17', '18', '19', '20', '21', '22'],
  },
  watchCases: {
    label: 'Watch Cases (mm)',
    values: ['38mm', '40mm', '41mm', '42mm', '44mm', '45mm', '49mm'],
  },
  liquids: {
    label: 'Volumes (ml)',
    values: ['50ml', '100ml', '200ml', '250ml', '500ml'],
  },
};
