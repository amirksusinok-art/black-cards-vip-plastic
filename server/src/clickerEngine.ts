/**
 * Server Clicker & Economy Engine
 * Hardcore economics configuration:
 * Power levels (Coins/click): 1 -> 2 -> 3 -> 4 -> 5
 * Power upgrade costs: 250, 750, 2000, 5000 Coins
 * Energy recovery speeds (seconds per 1 energy): 30s -> 24s -> 18s -> 12s -> 6s
 * Energy upgrade costs: 300, 1000, 3000, 7500 Coins
 */

export const MAX_ENERGY = 100;
export const MAX_LEVEL = 5;
export const DAILY_HELP_AMOUNT = 300;
export const DAILY_HELP_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ClickerConfig {
  powerUpgradeCosts: Record<number, number>; // level -> cost to reach this level
  rechargeUpgradeCosts: Record<number, number>; // level -> cost to reach this level
  rechargeSecondsPerUnit: Record<number, number>; // level -> seconds for 1 energy
}

export const CLICKER_CONFIG: ClickerConfig = {
  powerUpgradeCosts: {
    2: 250,
    3: 750,
    4: 2000,
    5: 5000,
  },
  rechargeUpgradeCosts: {
    2: 300,
    3: 1000,
    4: 3000,
    5: 7500,
  },
  rechargeSecondsPerUnit: {
    1: 30,
    2: 24,
    3: 18,
    4: 12,
    5: 6,
  },
};

export interface ClickerTask {
  id: string;
  title: string;
  description: string;
  reward: number;
  targetCount: number;
  type: 'clicks' | 'upgrades' | 'login';
}

export const CLICKER_TASKS: ClickerTask[] = [
  { id: 'click_50', title: '50 нажатий', description: 'Сделайте 50 успешных кликов по монете', reward: 50, targetCount: 50, type: 'clicks' },
  { id: 'click_100', title: '100 нажатий', description: 'Сделайте 100 успешных кликов по монете', reward: 100, targetCount: 100, type: 'clicks' },
  { id: 'buy_upgrade', title: 'Прокачка', description: 'Купите любое улучшение в кликере', reward: 150, targetCount: 1, type: 'upgrades' },
  { id: 'daily_enter', title: 'Визит в кликер', description: 'Зайдите в раздел заработка сегодня', reward: 50, targetCount: 1, type: 'login' },
];

/**
 * Calculates current energy based on server timestamps
 */
export function calculateCurrentEnergy(
  storedEnergy: number,
  lastUpdatedIso: string,
  rechargeLevel: number
): {
  currentEnergy: number;
  secondsUntilNextEnergy: number;
  lastUpdatedIso: string;
} {
  const secondsPerUnit = CLICKER_CONFIG.rechargeSecondsPerUnit[rechargeLevel] || 30;
  const now = Date.now();
  const lastTime = new Date(lastUpdatedIso).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - lastTime) / 1000));

  if (storedEnergy >= MAX_ENERGY) {
    return {
      currentEnergy: MAX_ENERGY,
      secondsUntilNextEnergy: 0,
      lastUpdatedIso: new Date(now).toISOString(),
    };
  }

  const recoveredUnits = Math.floor(elapsedSeconds / secondsPerUnit);
  const newEnergy = Math.min(MAX_ENERGY, storedEnergy + recoveredUnits);

  let secondsUntilNextEnergy = 0;
  let updatedTimestamp = lastTime;

  if (newEnergy >= MAX_ENERGY) {
    secondsUntilNextEnergy = 0;
    updatedTimestamp = now;
  } else {
    const remainderSeconds = elapsedSeconds % secondsPerUnit;
    secondsUntilNextEnergy = secondsPerUnit - remainderSeconds;
    updatedTimestamp = lastTime + recoveredUnits * secondsPerUnit * 1000;
  }

  return {
    currentEnergy: newEnergy,
    secondsUntilNextEnergy,
    lastUpdatedIso: new Date(updatedTimestamp).toISOString(),
  };
}

/**
 * Validates and processes a tap batch (anti-fraud protection)
 */
export function validateTapBatch(params: {
  tapsCount: number;
  powerLevel: number;
  currentEnergy: number;
}): {
  allowedTaps: number;
  coinsEarned: number;
  energySpent: number;
  remainingEnergy: number;
} {
  const { tapsCount, powerLevel, currentEnergy } = params;

  // Max taps per single network dispatch is capped at 50
  const safeTapsRequested = Math.min(Math.max(tapsCount, 1), 50);

  // Available energy is the hard ceiling
  const allowedTaps = Math.min(safeTapsRequested, currentEnergy);

  if (allowedTaps <= 0) {
    return {
      allowedTaps: 0,
      coinsEarned: 0,
      energySpent: 0,
      remainingEnergy: currentEnergy,
    };
  }

  const coinsPerTap = Math.min(Math.max(powerLevel, 1), MAX_LEVEL);
  const coinsEarned = allowedTaps * coinsPerTap;
  const energySpent = allowedTaps;
  const remainingEnergy = currentEnergy - energySpent;

  return {
    allowedTaps,
    coinsEarned,
    energySpent,
    remainingEnergy,
  };
}
