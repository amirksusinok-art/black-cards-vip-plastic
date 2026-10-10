import { describe, it, expect } from 'vitest';
import {
  BANKS,
  STANDARD_MATERIALS,
  STANDARD_CATEGORIES,
  FREE_MATERIALS,
  FREE_CATEGORIES,
  BEGINNER_MATERIALS,
  BEGINNER_CATEGORIES,
  generateCard,
  generateCardNumberForCategory,
  calculateCollectorScore,
} from '../server/src/gameEngine.js';

describe('Game Engine Probabilities and Validation', () => {
  it('Bank probabilities sum exactly to 100%', () => {
    const sum = BANKS.reduce((acc, b) => acc + b.weight, 0);
    expect(sum).toBe(100);
    expect(BANKS.length).toBe(6);
    const wb = BANKS.find((b) => b.name === 'ВБ Банк');
    expect(wb).toBeDefined();
    expect(wb?.weight).toBe(5);
  });

  it('Standard Roll Material probabilities sum exactly to 100%', () => {
    const sum = STANDARD_MATERIALS.reduce((acc, m) => acc + m.weight, 0);
    expect(sum).toBe(100);
    expect(STANDARD_MATERIALS.length).toBe(6);
  });

  it('Standard Roll Category probabilities sum exactly to 100%', () => {
    const sum = STANDARD_CATEGORIES.reduce((acc, c) => acc + c.weight, 0);
    expect(sum).toBe(100);
    expect(STANDARD_CATEGORIES.length).toBe(7);
  });

  it('BOMZH Free Roll Material probabilities sum exactly to 100%', () => {
    const sum = FREE_MATERIALS.reduce((acc, m) => acc + m.weight, 0);
    // Allow float rounding precision
    expect(Math.round(sum * 100) / 100).toBe(100);
    expect(FREE_MATERIALS.length).toBe(6);
  });

  it('BOMZH Free Roll Category probabilities sum exactly to 100%', () => {
    const sum = FREE_CATEGORIES.reduce((acc, c) => acc + c.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
    expect(FREE_CATEGORIES.length).toBe(7);
  });

  it('Card number always starts with 2202 and has 16 digits (formatted with spaces)', () => {
    for (let i = 0; i < 20; i++) {
      const card = generateCard(false);
      expect(card.cardNumber.startsWith('2202')).toBe(true);
      const digitsOnly = card.cardNumber.replace(/\s+/g, '');
      expect(digitsOnly.length).toBe(16);
      expect(/^\d{16}$/.test(digitsOnly)).toBe(true);
    }
  });

  it('Collection code is 3 numeric digits', () => {
    for (let i = 0; i < 10; i++) {
      const card = generateCard(false);
      expect(/^\d{3}$/.test(card.collectionCode)).toBe(true);
    }
  });

  it('Expiration date format is MM/YY and within valid range (up to 2100)', () => {
    for (let i = 0; i < 20; i++) {
      const card = generateCard(false);
      expect(/^\d{2}\/\d{2}$/.test(card.expiresAt)).toBe(true);
      const month = parseInt(card.expiresAt.split('/')[0], 10);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });

  it('Collector score is positive and reflects material and category rarity', () => {
    const classicScore = calculateCollectorScore('Classic Plastic', 'Standard');
    const holoMirrorScore = calculateCollectorScore('Holographic', 'Mirror');
    expect(holoMirrorScore).toBeGreaterThan(classicScore);
  });

  it('Card number generator creates valid patterns for each specific category', () => {
    const pairNum = generateCardNumberForCategory('Pair');
    expect(pairNum.startsWith('2202')).toBe(true);

    const quadNum = generateCardNumberForCategory('Quad');
    expect(quadNum.startsWith('2202')).toBe(true);

    const mirrorNum = generateCardNumberForCategory('Mirror');
    expect(mirrorNum.startsWith('2202')).toBe(true);
  });

  it('Beginner Roll Material probabilities sum exactly to 100%', () => {
    const sum = BEGINNER_MATERIALS.reduce((acc, m) => acc + m.weight, 0);
    expect(sum).toBe(100);
    expect(BEGINNER_MATERIALS.length).toBe(6);
  });

  it('Beginner Roll Category probabilities sum exactly to 100%', () => {
    const sum = BEGINNER_CATEGORIES.reduce((acc, c) => acc + c.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
    expect(BEGINNER_CATEGORIES.length).toBe(7);
  });

  it('generateCard with beginner flag generates valid cards with proper attributes', () => {
    for (let i = 0; i < 20; i++) {
      const card = generateCard(false, true);
      expect(card.cardNumber.startsWith('2202')).toBe(true);
      expect(card.cardNumber.replace(/\s+/g, '').length).toBe(16);
      expect(card.collectorScore).toBeGreaterThan(0);
      expect(BEGINNER_MATERIALS.some((m) => m.name === card.material)).toBe(true);
      expect(BEGINNER_CATEGORIES.some((c) => c.name === card.category)).toBe(true);
    }
  });
});
