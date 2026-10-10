import crypto from 'crypto';

export type BankName =
  | 'Алфа Банк'
  | 'ЗверьБанк'
  | 'ОзановБанк'
  | 'Тинькоффи'
  | 'ОООтмыв Банк'
  | 'ВБ Банк';

export type MaterialName =
  | 'Classic Plastic'
  | 'Matte Plastic'
  | 'Gold'
  | 'Black Carbon'
  | 'Titanium'
  | 'Holographic';

export type CategoryName =
  | 'Standard'
  | 'Pair'
  | 'Triple'
  | 'Quad'
  | 'Repeater'
  | 'Straight'
  | 'Mirror';

export interface GeneratedCard {
  bank: BankName;
  material: MaterialName;
  category: CategoryName;
  cardNumber: string;
  collectionCode: string;
  expiresAt: string;
  collectorScore: number;
  templateKey: string;
  serialNumber: string;
}

// 6 Banks: WB Bank at 5%, remaining 5 banks at 19% each (Sum = 100%)
export const BANKS: { name: BankName; weight: number }[] = [
  { name: 'Алфа Банк', weight: 19 },
  { name: 'ЗверьБанк', weight: 19 },
  { name: 'ОзановБанк', weight: 19 },
  { name: 'Тинькоффи', weight: 19 },
  { name: 'ОООтмыв Банк', weight: 19 },
  { name: 'ВБ Банк', weight: 5 },
];

// Standard roll materials (Sum = 100%)
export const STANDARD_MATERIALS: { name: MaterialName; weight: number }[] = [
  { name: 'Classic Plastic', weight: 45 },
  { name: 'Matte Plastic', weight: 25 },
  { name: 'Gold', weight: 12 },
  { name: 'Black Carbon', weight: 10 },
  { name: 'Titanium', weight: 6 },
  { name: 'Holographic', weight: 2 },
];

// Standard roll categories (Sum = 100%)
export const STANDARD_CATEGORIES: { name: CategoryName; weight: number }[] = [
  { name: 'Standard', weight: 70 },
  { name: 'Pair', weight: 16 },
  { name: 'Triple', weight: 6 },
  { name: 'Quad', weight: 2 },
  { name: 'Repeater', weight: 3 },
  { name: 'Straight', weight: 2 },
  { name: 'Mirror', weight: 1 },
];

// BOMZH Free roll materials (Sum = 100%)
export const FREE_MATERIALS: { name: MaterialName; weight: number }[] = [
  { name: 'Classic Plastic', weight: 94.5 },
  { name: 'Matte Plastic', weight: 2.5 },
  { name: 'Gold', weight: 1.2 },
  { name: 'Black Carbon', weight: 1.0 },
  { name: 'Titanium', weight: 0.6 },
  { name: 'Holographic', weight: 0.2 },
];

// BOMZH Free roll categories (Sum = 100%)
export const FREE_CATEGORIES: { name: CategoryName; weight: number }[] = [
  { name: 'Standard', weight: 97.0 },
  { name: 'Pair', weight: 1.6 },
  { name: 'Triple', weight: 0.6 },
  { name: 'Quad', weight: 0.2 },
  { name: 'Repeater', weight: 0.3 },
  { name: 'Straight', weight: 0.2 },
  { name: 'Mirror', weight: 0.1 },
];

// Beginner roll materials (first 10 spins: 0.5x luck for rare tiers)
export const BEGINNER_MATERIALS: { name: MaterialName; weight: number }[] = [
  { name: 'Classic Plastic', weight: 55 },
  { name: 'Matte Plastic', weight: 30 },
  { name: 'Gold', weight: 6 },
  { name: 'Black Carbon', weight: 5 },
  { name: 'Titanium', weight: 3 },
  { name: 'Holographic', weight: 1 },
];

// Beginner roll categories (first 10 spins: 0.5x luck for rare combinations)
export const BEGINNER_CATEGORIES: { name: CategoryName; weight: number }[] = [
  { name: 'Standard', weight: 85 },
  { name: 'Pair', weight: 8 },
  { name: 'Triple', weight: 3 },
  { name: 'Repeater', weight: 1.5 },
  { name: 'Straight', weight: 1 },
  { name: 'Quad', weight: 1 },
  { name: 'Mirror', weight: 0.5 },
];

/**
 * Cryptographically secure random float in [0, 1)
 */
export function secureRandomFloat(): number {
  const buf = crypto.randomBytes(4);
  const uint = buf.readUInt32BE(0);
  return uint / 0x100000000;
}

/**
 * Cryptographically secure random integer in [min, max] inclusive
 */
export function secureRandomInt(min: number, max: number): number {
  return crypto.randomInt(min, max + 1);
}

/**
 * Weighted choice using secure RNG
 */
export function pickWeighted<T>(items: { name: T; weight: number }[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const randomVal = secureRandomFloat() * total;
  let running = 0;
  for (const item of items) {
    running += item.weight;
    if (randomVal <= running) {
      return item.name;
    }
  }
  return items[items.length - 1].name;
}

/**
 * Generate card number matching category
 * Always starts with "2202"
 */
export function generateCardNumberForCategory(category: CategoryName): string {
  const prefix = '2202';

  // Helper: random digit string of length n
  const randomDigits = (len: number): string => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += secureRandomInt(0, 9).toString();
    }
    return s;
  };

  let remainder = '';

  switch (category) {
    case 'Pair': {
      // Contains a double digit pair, e.g. 77
      const d = secureRandomInt(0, 9).toString();
      const pair = d + d;
      const left = randomDigits(5);
      const right = randomDigits(5);
      remainder = left + pair + right;
      break;
    }
    case 'Triple': {
      // 3 consecutive identical digits e.g. 777
      const d = secureRandomInt(0, 9).toString();
      const triple = d.repeat(3);
      const left = randomDigits(4);
      const right = randomDigits(5);
      remainder = left + triple + right;
      break;
    }
    case 'Quad': {
      // 4 consecutive identical digits e.g. 8888
      const d = secureRandomInt(0, 9).toString();
      const quad = d.repeat(4);
      const left = randomDigits(4);
      const right = randomDigits(4);
      remainder = left + quad + right;
      break;
    }
    case 'Repeater': {
      // Repeating pattern like ABAB or ABCABC
      const a = secureRandomInt(0, 9).toString();
      const b = secureRandomInt(0, 9).toString();
      const pat = a + b + a + b + a + b; // 6 digits
      const left = randomDigits(3);
      const right = randomDigits(3);
      remainder = left + pat + right;
      break;
    }
    case 'Straight': {
      // Sequential numbers like 123456 or 4567
      const start = secureRandomInt(0, 4);
      const straight = [start, start + 1, start + 2, start + 3, start + 4, start + 5].join('');
      const left = randomDigits(3);
      const right = randomDigits(3);
      remainder = left + straight + right;
      break;
    }
    case 'Mirror': {
      // Palindrome sequence e.g. ABCBA or ABCCBA
      const a = secureRandomInt(0, 9).toString();
      const b = secureRandomInt(0, 9).toString();
      const c = secureRandomInt(0, 9).toString();
      const d = secureRandomInt(0, 9).toString();
      const mirror = a + b + c + d + d + c + b + a; // 8 digit palindrome
      const left = randomDigits(2);
      const right = randomDigits(2);
      remainder = left + mirror + right;
      break;
    }
    case 'Standard':
    default: {
      remainder = randomDigits(12);
      break;
    }
  }

  // Ensure exactly 12 digits in remainder
  if (remainder.length !== 12) {
    remainder = (remainder + randomDigits(12)).slice(0, 12);
  }

  const full = prefix + remainder;
  // Format as "2202 XXXX XXXX XXXX"
  return `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8, 12)} ${full.slice(12, 16)}`;
}

/**
 * Random collection code (3 digits e.g. "042")
 */
export function generateCollectionCode(): string {
  const code = secureRandomInt(1, 999);
  return code.toString().padStart(3, '0');
}

/**
 * Unique serial ID in format CD-XXXXXX (e.g. CD-008421)
 */
export function generateSerialNumber(): string {
  const code = secureRandomInt(1, 999999);
  return `CD-${code.toString().padStart(6, '0')}`;
}

/**
 * Expiration date: from current month to Dec 2100 inclusive
 */
export function generateExpiresAt(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const year = secureRandomInt(currentYear, 2100);
  let month: number;
  if (year === currentYear) {
    month = secureRandomInt(currentMonth, 12);
  } else {
    month = secureRandomInt(1, 12);
  }

  const monthStr = month.toString().padStart(2, '0');
  const yearShort = year.toString().slice(-2);
  return `${monthStr}/${yearShort}`;
}

/**
 * Calculate collector rarity score
 */
export function calculateCollectorScore(material: MaterialName, category: CategoryName): number {
  const materialWeights: Record<MaterialName, number> = {
    'Classic Plastic': 10,
    'Matte Plastic': 25,
    'Gold': 60,
    'Black Carbon': 80,
    'Titanium': 120,
    'Holographic': 250,
  };

  const categoryWeights: Record<CategoryName, number> = {
    'Standard': 10,
    'Pair': 25,
    'Triple': 75,
    'Repeater': 100,
    'Straight': 150,
    'Quad': 250,
    'Mirror': 350,
  };

  const base = (materialWeights[material] || 10) + (categoryWeights[category] || 10);
  const bonus = secureRandomInt(0, 20);
  return base + bonus;
}

/**
 * Main Card Generator
 */
export function generateCard(isFreeRoll = false, isBeginner = false): GeneratedCard {
  const bank = pickWeighted(BANKS);
  const material = isFreeRoll
    ? pickWeighted(FREE_MATERIALS)
    : isBeginner
    ? pickWeighted(BEGINNER_MATERIALS)
    : pickWeighted(STANDARD_MATERIALS);

  const category = isFreeRoll
    ? pickWeighted(FREE_CATEGORIES)
    : isBeginner
    ? pickWeighted(BEGINNER_CATEGORIES)
    : pickWeighted(STANDARD_CATEGORIES);

  const cardNumber = generateCardNumberForCategory(category);
  const collectionCode = generateCollectionCode();
  const serialNumber = generateSerialNumber();
  const expiresAt = generateExpiresAt();
  const collectorScore = calculateCollectorScore(material, category);
  const templateKey = `${bank}|${material}|${category}|v1`;

  return {
    bank,
    material,
    category,
    cardNumber,
    collectionCode,
    serialNumber,
    expiresAt,
    collectorScore,
    templateKey,
  };
}
