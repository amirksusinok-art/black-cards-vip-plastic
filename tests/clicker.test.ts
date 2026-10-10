import { describe, it, expect } from 'vitest';
import {
  calculateCurrentEnergy,
  validateTapBatch,
  CLICKER_CONFIG,
  MAX_ENERGY,
} from '../server/src/clickerEngine.js';
import {
  CASE_TIERS,
  generateCard,
  getMaterialsForTier,
  getCategoriesForTier,
} from '../server/src/gameEngine.js';

describe('Clicker System Engine Tests', () => {
  it('correctly calculates energy recovery over elapsed time', () => {
    const now = Date.now();
    // 60 seconds ago, initial energy 10, speed level 1 (30s per unit) -> recovers 2 units
    const lastIso = new Date(now - 60 * 1000).toISOString();
    const res = calculateCurrentEnergy(10, lastIso, 1);

    expect(res.currentEnergy).toBe(12);
    expect(res.secondsUntilNextEnergy).toBe(30);
  });

  it('respects faster recovery speed levels', () => {
    const now = Date.now();
    // 60 seconds ago, initial energy 10, speed level 5 (6s per unit) -> recovers 10 units
    const lastIso = new Date(now - 60 * 1000).toISOString();
    const res = calculateCurrentEnergy(10, lastIso, 5);

    expect(res.currentEnergy).toBe(20);
  });

  it('never exceeds MAX_ENERGY (100 units)', () => {
    const now = Date.now();
    // 10 hours ago -> energy is capped at 100
    const lastIso = new Date(now - 10 * 3600 * 1000).toISOString();
    const res = calculateCurrentEnergy(50, lastIso, 1);

    expect(res.currentEnergy).toBe(MAX_ENERGY);
    expect(res.secondsUntilNextEnergy).toBe(0);
  });

  it('validates tap batch and awards correct coins per power level', () => {
    const result = validateTapBatch({
      tapsCount: 10,
      powerLevel: 3, // 3 coins per tap
      currentEnergy: 50,
    });

    expect(result.allowedTaps).toBe(10);
    expect(result.coinsEarned).toBe(30);
    expect(result.energySpent).toBe(10);
    expect(result.remainingEnergy).toBe(40);
  });

  it('caps taps if energy is insufficient and blocks on 0 energy', () => {
    const partial = validateTapBatch({
      tapsCount: 15,
      powerLevel: 2,
      currentEnergy: 5,
    });

    expect(partial.allowedTaps).toBe(5);
    expect(partial.coinsEarned).toBe(10);
    expect(partial.energySpent).toBe(5);
    expect(partial.remainingEnergy).toBe(0);

    const empty = validateTapBatch({
      tapsCount: 10,
      powerLevel: 2,
      currentEnergy: 0,
    });

    expect(empty.allowedTaps).toBe(0);
    expect(empty.coinsEarned).toBe(0);
    expect(empty.energySpent).toBe(0);
    expect(empty.remainingEnergy).toBe(0);
  });

  it('verifies hardcore upgrade costs from specification', () => {
    expect(CLICKER_CONFIG.powerUpgradeCosts[2]).toBe(250);
    expect(CLICKER_CONFIG.powerUpgradeCosts[3]).toBe(750);
    expect(CLICKER_CONFIG.powerUpgradeCosts[4]).toBe(2000);
    expect(CLICKER_CONFIG.powerUpgradeCosts[5]).toBe(5000);

    expect(CLICKER_CONFIG.rechargeUpgradeCosts[2]).toBe(300);
    expect(CLICKER_CONFIG.rechargeUpgradeCosts[3]).toBe(1000);
    expect(CLICKER_CONFIG.rechargeUpgradeCosts[4]).toBe(3000);
    expect(CLICKER_CONFIG.rechargeUpgradeCosts[5]).toBe(7500);

    expect(CLICKER_CONFIG.rechargeSecondsPerUnit[1]).toBe(30);
    expect(CLICKER_CONFIG.rechargeSecondsPerUnit[5]).toBe(6);
  });
});

describe('Case Tiers Integration Tests', () => {
  it('has all 4 case tiers configured with matching multipliers', () => {
    expect(CASE_TIERS.standard.price).toBe(500);
    expect(CASE_TIERS.standard.luckMultiplier).toBe(1.0);

    expect(CASE_TIERS.go.price).toBe(1000);
    expect(CASE_TIERS.go.luckMultiplier).toBe(1.5);

    expect(CASE_TIERS.plus.price).toBe(2000);
    expect(CASE_TIERS.plus.luckMultiplier).toBe(2.0);

    expect(CASE_TIERS.elite.price).toBe(5000);
    expect(CASE_TIERS.elite.luckMultiplier).toBe(3.0);
  });

  it('boosts high rarity chances on higher tiers', () => {
    const standardMaterials = getMaterialsForTier('standard');
    const eliteMaterials = getMaterialsForTier('elite');

    // Elite tier has higher weight for Titanium, Holographic and Gold than Standard
    const standardHoloWeight = standardMaterials.find((m) => m.name === 'Holographic')?.weight || 0;
    const eliteHoloWeight = eliteMaterials.find((m) => m.name === 'Holographic')?.weight || 0;

    expect(eliteHoloWeight).toBeGreaterThan(standardHoloWeight);
  });

  it('generates valid cards using different tiers', () => {
    const cardStandard = generateCard(false, false, 'standard');
    const cardElite = generateCard(false, false, 'elite');

    expect(cardStandard).toHaveProperty('bank');
    expect(cardStandard).toHaveProperty('material');
    expect(cardStandard).toHaveProperty('collectorScore');

    expect(cardElite).toHaveProperty('bank');
    expect(cardElite).toHaveProperty('material');
    expect(cardElite).toHaveProperty('collectorScore');
  });
});
