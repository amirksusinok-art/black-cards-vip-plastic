import { Card, MaterialName, CategoryName } from './gameEngine.js';

export interface CardEvaluation {
  cardId: number;
  initialPrice: number;
  maxPrice: number;
  baseValuation: number;
  spread: number;
  rationale: string;
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
  baseValuation?: number;
  rationale?: string;
  roundsUsed: number;
  status: 'active' | 'accepted' | 'rejected' | 'cancelled';
  dialogHistory: { sender: 'avita' | 'player'; message: string; timestamp: string }[];
  isLastRound: boolean;
  blockedUntil?: string | null;
}

export const CASE_PRICE = 500;

/**
 * Generate human explanation for card valuation
 */
export function getValuationRationale(card: any): string {
  const mat = card.material || 'Classic Plastic';
  const cat = card.category || 'Standard';
  const bank = card.bank || 'Алфа Банк';

  const isRareMat = ['Gold', 'Black Carbon', 'Titanium', 'Holographic'].includes(mat);
  const isRareCat = cat !== 'Standard';

  if (bank === 'ВБ Банк') {
    return `Эксклюзивный WB Bank с 5% шансом выпадения. Фирменный цвет и повышенный спрос у коллекционеров.`;
  }
  if (isRareMat && !isRareCat) {
    return `Материал редкий (${mat}), но категория номера распространённая (${cat}) — металл ценный, однако номер стандартный.`;
  }
  if (!isRareMat && isRareCat) {
    return `Категория номера редкая (${cat}), но материал базовый (${mat}) — красивый номерной узор, хотя пластик обычный.`;
  }
  if (isRareMat && isRareCat) {
    return `Исключительное комбо: благородный ${mat} с редким узором ${cat} — высокая коллекционная ценность.`;
  }
  return `Базовый пластик (${mat}) со стандартным номером (${cat}) — умеренный спрос на вторичном рынке.`;
}

/**
 * Calculate Avita's valuation for a single card
 * Standard cards sell for roughly 10% - 40% of case price (50 - 200 ₽)
 */
export function evaluateSingleCard(card: any): CardEvaluation {
  // Free roll cards cannot be sold!
  if (card.is_free_roll) {
    return {
      cardId: card.id,
      initialPrice: 0,
      maxPrice: 0,
      baseValuation: 0,
      spread: 0,
      rationale: 'Карта получена бесплатно в режиме «БОМЖ» и не подлежит продаже.',
      isEligible: false,
      rejectReason: 'Эту карту я не покупаю. Она получена в бесплатном режиме («БОМЖ») и не предназначена для продажи.',
    };
  }

  // Material base value (tied to case price 500 ₽)
  const materialBase: Record<string, number> = {
    'Classic Plastic': 70,    // Base for common: ~14% of case
    'Matte Plastic': 130,     // ~26% of case
    'Gold': 1800,             // Rare tier profit (3.6x case)
    'Black Carbon': 3600,     // Epic tier
    'Titanium': 9000,         // Legendary tier
    'Holographic': 18000,     // Ultra mythical tier
  };

  // Category bonus for lucky digit patterns
  const categoryBonus: Record<string, number> = {
    'Standard': 0,
    'Pair': 100,              // e.g. Classic Pair total base ~220 ₽ (44% of case)
    'Triple': 250,
    'Repeater': 400,
    'Straight': 800,          // Recoups case cost
    'Quad': 2000,             // 4x case cost
    'Mirror': 12000,          // Rare mirror reflection
  };

  const mat = card.material || 'Classic Plastic';
  const cat = card.category || 'Standard';
  const score = card.collector_score || 20;

  // Score multiplier based on tier
  const isHighTier = ['Titanium', 'Holographic'].includes(mat);
  const scoreMultiplier = isHighTier ? 30 : ['Gold', 'Black Carbon'].includes(mat) ? 15 : 2;
  const scoreBonus = Math.round(score * scoreMultiplier);

  const calculatedBase = (materialBase[mat] ?? 70) + (categoryBonus[cat] ?? 0) + scoreBonus;

  // Max price player can reach via negotiation (~1.3x base)
  // For Classic Plastic Standard (score 25): base = 70 + 0 + 50 = 120 ₽.
  // maxPrice = 160 ₽ (32% of 500 ₽ case).
  // initialPrice = 80 ₽ (16% of 500 ₽ case). Perfectly in the 10-40% range!
  const maxPrice = Math.max(Math.round((calculatedBase * 1.3) / 10) * 10, 80);
  const initialPrice = Math.max(Math.round((calculatedBase * 0.7) / 10) * 10, 50);
  const rationale = getValuationRationale(card);
  const spread = initialPrice - calculatedBase;

  return {
    cardId: card.id,
    initialPrice,
    maxPrice,
    baseValuation: calculatedBase,
    spread,
    rationale,
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
  totalBaseValuation: number;
  overallRationale: string;
  ineligibleCards: any[];
} {
  const evaluations: CardEvaluation[] = [];
  const ineligibleCards: any[] = [];
  let totalInitial = 0;
  let totalMax = 0;
  let totalBaseValuation = 0;

  for (const card of cards) {
    const ev = evaluateSingleCard(card);
    if (!ev.isEligible) {
      ineligibleCards.push(card);
    } else {
      evaluations.push(ev);
      totalInitial += ev.initialPrice;
      totalMax += ev.maxPrice;
      totalBaseValuation += ev.baseValuation;
    }
  }

  const overallRationale =
    cards.length === 1 && evaluations.length === 1
      ? evaluations[0].rationale
      : `Пакетная оценка ${evaluations.length} карт с учётом редкости материалов и спроса на вторичном рынке.`;

  return {
    evaluations,
    totalInitial,
    totalMax,
    totalBaseValuation,
    overallRationale,
    ineligibleCards,
  };
}

/**
 * Generate Avita's greeting / first offer response
 */
/**
 * Generate Avita's greeting / first offer response
 */
export function generateInitialGreeting(cards: any[], initialOffer: number, userDealsCount = 0): string {
  const formatted = initialOffer.toLocaleString('ru-RU');
  const trustIntro = userDealsCount >= 5 ? 'О, постоянный клиент! Рада видеть. ' : userDealsCount >= 2 ? 'Снова ты? Отлично. ' : '';

  if (cards.length === 1) {
    const card = cards[0];
    const mat = card.material || 'Classic Plastic';
    const cat = card.category || 'Standard';
    const bank = card.bank || 'Алфа Банк';

    // 1. Super rare material or special combination
    if (['Holographic', 'Titanium'].includes(mat) || ['Mirror', 'Quad'].includes(cat)) {
      const rareGreetings = [
        `${trustIntro}Постой-ка... ${mat} и ${cat}? Такое я не каждый день вижу! За эту карту готова предложить больше обычного: ${formatted} ₽. По рукам?`,
        `${trustIntro}Ого, тяжёлая артиллерия! Настоящий ${mat}. За такой экземпляр клиенты подерутся. Моё открытие — ${formatted} ₽.`,
        `${trustIntro}Вот это находка! Редкость зашкаливает. Отдаю ${formatted} ₽ прямо с порога — по рукам или поторгуемся?`,
      ];
      return rareGreetings[Math.floor(Math.random() * rareGreetings.length)];
    }

    // 2. Exclusive WB Bank
    if (bank === 'ВБ Банк') {
      const wbGreetings = [
        `${trustIntro}О, фирменный ВБ Банк! 5% шанс на дроп, коллекционеры за ним охотятся. Начнём с ${formatted} ₽, давай обсуждать.`,
        `${trustIntro}Пурпурный ВБ Банк? Редкая птица на вторичке. Даю ${formatted} ₽ для старта. Договоримся?`,
      ];
      return wbGreetings[Math.floor(Math.random() * wbGreetings.length)];
    }

    // 3. Gold or Black Carbon
    if (['Gold', 'Black Carbon'].includes(mat)) {
      const goldGreetings = [
        `${trustIntro}Приятный металл, ${mat} всегда в цене. Стартую с ${formatted} ₽. Что скажешь?`,
        `${trustIntro}Хм, отличный блеск. За такой ${mat} не жалко отдать ${formatted} ₽. Торгуемся?`,
      ];
      return goldGreetings[Math.floor(Math.random() * goldGreetings.length)];
    }

    // 4. Standard common cards
    const rationale = getValuationRationale(card);
    const commonGreetings = [
      `${trustIntro}Хм, неплохая карта. Начнём с ${formatted} ₽. Посмотрим, насколько мы с тобой сговорчивые.`,
      `${trustIntro}Посмотрим, что у тебя тут. ${rationale} Моё начальное предложение — ${formatted} ₽. Согласен?`,
      `${trustIntro}Обычный рабочий пластик. Для коллекции сгодится. Моё первое предложение — ${formatted} ₽. Забираешь?`,
      `${trustIntro}Вижу, решил разгрузить карманы. ${mat}, узор ${cat}. Готова отдать ${formatted} ₽ прямо сейчас.`,
    ];
    return commonGreetings[Math.floor(Math.random() * commonGreetings.length)];
  }

  // Multiple cards batch
  const batchGreetings = [
    `${trustIntro}Ого, оптовая партия из ${cards.length} карт! Люблю скупать объёмами. За всю подборку дам ${formatted} ₽. Договоримся?`,
    `${trustIntro}Принёс сразу ${cards.length} карт? За всю подборку готова предложить ${formatted} ₽. Можем договориться сразу или поторговаться.`,
    `${trustIntro}Солидная пачка! За все ${cards.length} карт выложу ${formatted} ₽ одной суммой. По рукам?`,
  ];
  return batchGreetings[Math.floor(Math.random() * batchGreetings.length)];
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
    const successReplies = [
      `По рукам! Сделка завершена. Забирай свои ${currentOffer.toLocaleString('ru-RU')} ₽.`,
      `По рукам! Договорились, перевожу ${currentOffer.toLocaleString('ru-RU')} ₽. Приятно иметь дело!`,
      `По рукам! Отлично сторговались, твои ${currentOffer.toLocaleString('ru-RU')} ₽ уже на счету. Приноси ещё!`,
    ];
    return {
      accepted: true,
      rejected: false,
      newOffer: currentOffer,
      avitaReply: successReplies[Math.floor(Math.random() * successReplies.length)],
      isLastRound: false,
    };
  }

  // Case 2: Player asks for insane price (> 2.2x maxOffer) -> Immediate walkout & block
  if (playerDemand > maxOffer * 2.2) {
    const outrageReplies = [
      `Ты продаёшь карту или собираешься купить весь мой магазин? Давай вернёмся к разумным цифрам. Сделка сорвана! Отдохни две минуты.`,
      `Нет, за такую цену (${playerDemand.toLocaleString('ru-RU')} ₽) я брать не буду. Мы не договорились. Возвращайся через две минуты, если захочешь попробовать ещё раз.`,
      `${playerDemand.toLocaleString('ru-RU')} ₽?! Ты с луны свалился? Я скупщик, а не благотворительный фонд. Возвращайся через две минуты, когда пыл остынет!`,
    ];
    return {
      accepted: false,
      rejected: true,
      newOffer: currentOffer,
      avitaReply: outrageReplies[Math.floor(Math.random() * outrageReplies.length)],
      isLastRound: true,
    };
  }

  // Case 3: Player asks for price within reach (<= maxOffer)
  if (playerDemand <= maxOffer) {
    if (round >= 3) {
      // In round 3, accept player's fair price or give max offer
      const finalPrice = Math.min(playerDemand, maxOffer);
      const finalAcceptReplies = [
        `Упрямый ты. Ладно, ${finalPrice.toLocaleString('ru-RU')} ₽ — забирай, по рукам!`,
        `Выжал из меня максимум! ${finalPrice.toLocaleString('ru-RU')} ₽ — и мы квиты. Забирай монеты, по рукам!`,
        `Сдаюсь! Твоя взяла: ${finalPrice.toLocaleString('ru-RU')} ₽. По рукам, с тобой приятно торговаться!`,
      ];
      return {
        accepted: true,
        rejected: false,
        newOffer: finalPrice,
        avitaReply: finalAcceptReplies[Math.floor(Math.random() * finalAcceptReplies.length)],
        isLastRound: true,
      };
    }

    // Mid round: raise offer towards player demand
    const step = Math.max(Math.round(((playerDemand - currentOffer) * 0.6) / 10) * 10, 10);
    const raisedOffer = Math.min(currentOffer + step, maxOffer);

    const midRaiseReplies = [
      `${playerDemand.toLocaleString('ru-RU')} ₽? Ты, видимо, считаешь, что у меня денег бесконечно. Могу поднять до ${raisedOffer.toLocaleString('ru-RU')} ₽. Выше пока не готова.`,
      `Торговаться ты умеешь, признаю. Но аппетиты умерь. Могу поднять до ${raisedOffer.toLocaleString('ru-RU')} ₽. Что скажешь?`,
      `Хитро, но мой бюджет не резиновый. Могу поднять до ${raisedOffer.toLocaleString('ru-RU')} ₽. Это честная цена.`,
    ];

    return {
      accepted: false,
      rejected: false,
      newOffer: raisedOffer,
      avitaReply: midRaiseReplies[Math.floor(Math.random() * midRaiseReplies.length)],
      isLastRound: round === 2,
    };
  }

  // Case 4: Player asks for price > maxOffer
  if (round >= 3) {
    // 3rd round exceeded -> Final refusal & 120s block!
    const walkoutReplies = [
      `Тогда не договорились. Я предложила максимум ${maxOffer.toLocaleString('ru-RU')} ₽. Возвращайся через две минуты, возможно в другой раз найдём общую цену.`,
      `За ${playerDemand.toLocaleString('ru-RU')} ₽ я её потом полгода продавать буду. Я предложила крайние ${maxOffer.toLocaleString('ru-RU')} ₽. Сделки не будет, возвращайся через две минуты.`,
      `Жадность — плохой советчик. Мой абсолютный потолок был ${maxOffer.toLocaleString('ru-RU')} ₽. Возвращайся через две минуты.`,
    ];
    return {
      accepted: false,
      rejected: true,
      newOffer: maxOffer,
      avitaReply: walkoutReplies[Math.floor(Math.random() * walkoutReplies.length)],
      isLastRound: true,
    };
  }

  if (round === 2) {
    // Round 2 warning
    return {
      accepted: false,
      rejected: false,
      newOffer: maxOffer,
      avitaReply: `За ${playerDemand.toLocaleString('ru-RU')} ₽ я лучше поищу другую карту. Моё встречное предложение — ${maxOffer.toLocaleString('ru-RU')} ₽. Это почти предел и последний раунд.`,
      isLastRound: true,
    };
  }

  // Round 1 counter
  const halfway = Math.min(Math.round((currentOffer + maxOffer) / 2 / 10) * 10, maxOffer);
  return {
    accepted: false,
    rejected: false,
    newOffer: halfway,
    avitaReply: `Слишком много просишь. За ${playerDemand.toLocaleString('ru-RU')} ₽ не возьму. Могу поднять до ${halfway.toLocaleString('ru-RU')} ₽.`,
    isLastRound: false,
  };
}
