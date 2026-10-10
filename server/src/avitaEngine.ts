import { Card, MaterialName, CategoryName } from './gameEngine.js';

export interface CardEvaluation {
  cardId: number;
  initialPrice: number;
  maxPrice: number;
  isEligible: boolean;
  rejectReason?: string;
}

export interface AvitaSession {
  sessionId: string;
  userId: number;
  cardIds: number[];
  initialOffer: number;
  currentOffer: number;
  maxOffer: number;
  roundsUsed: number;
  status: 'active' | 'accepted' | 'rejected' | 'cancelled';
  dialogHistory: { sender: 'avita' | 'player'; message: string; timestamp: string }[];
  isLastRound: boolean;
  blockedUntil?: string | null;
}

/**
 * Calculate Avita's valuation for a single card
 */
export function evaluateSingleCard(card: any): CardEvaluation {
  // Free roll cards cannot be sold!
  if (card.is_free_roll) {
    return {
      cardId: card.id,
      initialPrice: 0,
      maxPrice: 0,
      isEligible: false,
      rejectReason: 'Эту карту я не покупаю. Она получена в бесплатном режиме и не предназначена для продажи.',
    };
  }

  // Material multipliers
  const materialBonus: Record<string, number> = {
    'Classic Plastic': 500,
    'Matte Plastic': 1500,
    'Gold': 4500,
    'Black Carbon': 7000,
    'Titanium': 12000,
    'Holographic': 22000,
  };

  // Category multipliers
  const categoryBonus: Record<string, number> = {
    'Standard': 300,
    'Pair': 1200,
    'Triple': 3500,
    'Repeater': 5000,
    'Straight': 7500,
    'Quad': 12000,
    'Mirror': 18000,
  };

  const mat = card.material || 'Classic Plastic';
  const cat = card.category || 'Standard';
  const score = card.collector_score || 20;

  const calculatedBase = (score * 40) + (materialBonus[mat] || 500) + (categoryBonus[cat] || 300);

  // Round to nice numbers (e.g. multiples of 100)
  const maxPrice = Math.round(calculatedBase / 100) * 100;
  // Initial offer is roughly 70-75% of max price
  const initialPrice = Math.round((maxPrice * 0.72) / 100) * 100;

  return {
    cardId: card.id,
    initialPrice: Math.max(initialPrice, 1000),
    maxPrice: Math.max(maxPrice, 1500),
    isEligible: true,
  };
}

/**
 * Calculate valuation for multiple cards batch
 */
export function evaluateBatchCards(cards: any[]): {
  evaluations: CardEvaluation[];
  totalInitial: number;
  totalMax: number;
  ineligibleCards: any[];
} {
  const evaluations: CardEvaluation[] = [];
  const ineligibleCards: any[] = [];
  let totalInitial = 0;
  let totalMax = 0;

  for (const card of cards) {
    const ev = evaluateSingleCard(card);
    if (!ev.isEligible) {
      ineligibleCards.push(card);
    } else {
      evaluations.push(ev);
      totalInitial += ev.initialPrice;
      totalMax += ev.maxPrice;
    }
  }

  return {
    evaluations,
    totalInitial,
    totalMax,
    ineligibleCards,
  };
}

/**
 * Generate Avita's greeting / first offer response
 */
export function generateInitialGreeting(cards: any[], initialOffer: number): string {
  if (cards.length === 1) {
    const card = cards[0];
    if (card.material === 'Holographic') {
      return `Ого, ${card.material} с узором ${card.category}? Карта редкая и интересная. Предложу ${initialOffer.toLocaleString()} Coins. Но учти: такие вещи я оцениваю осторожно.`;
    }
    if (['Gold', 'Titanium', 'Black Carbon'].includes(card.material)) {
      return `Любопытный экземпляр: ${card.bank}, благородный ${card.material}. Могу предложить ${initialOffer.toLocaleString()} Coins. Соглашайся, пока предложение действует.`;
    }
    return `Посмотрим, что у тебя тут. За эту карту могу предложить ${initialOffer.toLocaleString()} Coins. Соглашайся, пока предложение действует.`;
  }

  return `Принёс сразу ${cards.length} карт? За всю подборку готова предложить ${initialOffer.toLocaleString()} Coins.`;
}

/**
 * Process a bargaining round (max 3 rounds)
 */
export function processBargainRound(params: {
  currentOffer: number;
  maxOffer: number;
  playerDemand: number;
  round: number; // 1, 2 or 3
}): {
  accepted: boolean;
  rejected: boolean; // triggers 120s cooldown
  newOffer: number;
  avitaReply: string;
  isLastRound: boolean;
} {
  const { currentOffer, maxOffer, playerDemand, round } = params;

  // Case 1: Player agrees or asks for less/equal to current offer
  if (playerDemand <= currentOffer) {
    return {
      accepted: true,
      rejected: false,
      newOffer: currentOffer,
      avitaReply: `По рукам! Сделка завершена. Забирай свои ${currentOffer.toLocaleString()} Coins.`,
      isLastRound: false,
    };
  }

  // Case 2: Player asks for insane price (> 2x maxOffer) -> Immediate walkout & block
  if (playerDemand > maxOffer * 2.2) {
    return {
      accepted: false,
      rejected: true,
      newOffer: currentOffer,
      avitaReply: `Нет, за такую цену (${playerDemand.toLocaleString()} Coins) я брать не буду. Мы не договорились. Возвращайся через две минуты, если захочешь попробовать ещё раз.`,
      isLastRound: true,
    };
  }

  // Case 3: Player asks for price within reach (<= maxOffer)
  if (playerDemand <= maxOffer) {
    if (round >= 3) {
      // In round 3, accept player's fair price or give max offer
      const finalPrice = Math.min(playerDemand, maxOffer);
      return {
        accepted: true,
        rejected: false,
        newOffer: finalPrice,
        avitaReply: `Упрямый ты. Ладно, ${finalPrice.toLocaleString()} Coins — забирай, по рукам!`,
        isLastRound: true,
      };
    }

    // Mid round: raise offer towards player demand
    const step = Math.round((playerDemand - currentOffer) * 0.6 / 100) * 100;
    const raisedOffer = Math.min(currentOffer + step, maxOffer);

    return {
      accepted: false,
      rejected: false,
      newOffer: raisedOffer,
      avitaReply: `${playerDemand.toLocaleString()}? Ты, видимо, считаешь, что у меня Coins бесконечные. Могу поднять до ${raisedOffer.toLocaleString()} Coins. Выше пока не готова.`,
      isLastRound: round === 2,
    };
  }

  // Case 4: Player asks for price > maxOffer
  if (round >= 3) {
    // 3rd round exceeded -> Final refusal & 120s block!
    return {
      accepted: false,
      rejected: true,
      newOffer: maxOffer,
      avitaReply: `Тогда не договорились. Я предложила максимум ${maxOffer.toLocaleString()} Coins. Возвращайся через две минуты, возможно в другой раз найдём общую цену.`,
      isLastRound: true,
    };
  }

  if (round === 2) {
    // Round 2 warning
    return {
      accepted: false,
      rejected: false,
      newOffer: maxOffer,
      avitaReply: `За ${playerDemand.toLocaleString()} я лучше поищу другую карту. Моё встречное предложение — ${maxOffer.toLocaleString()} Coins. Это почти предел и последний раунд.`,
      isLastRound: true,
    };
  }

  // Round 1 counter
  const halfway = Math.min(Math.round((currentOffer + maxOffer) / 2 / 100) * 100, maxOffer);
  return {
    accepted: false,
    rejected: false,
    newOffer: halfway,
    avitaReply: `Слишком много просишь. За ${playerDemand.toLocaleString()} не возьму. Могу поднять до ${halfway.toLocaleString()} Coins.`,
    isLastRound: false,
  };
}
