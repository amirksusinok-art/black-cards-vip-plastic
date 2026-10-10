export type BankName = 'Алфа Банк' | 'ЗверьБанк' | 'ОзановБанк' | 'Тинькоффи' | 'ОООтмыв Банк' | 'ВБ Банк';

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

export interface Card {
  id: number;
  card_uid: string;
  user_id: number;
  bank: BankName;
  material: MaterialName;
  category: CategoryName;
  card_number: string;
  collection_code: string;
  expires_at: string;
  collector_score: number;
  is_free_roll: boolean;
  serial_number?: string;
  created_at: string;
}

export interface CardTemplateGroup {
  templateKey: string;
  bank: BankName;
  material: MaterialName;
  category: CategoryName;
  count: number;
  sampleCard: Card;
}

export interface UserProfile {
  id: number;
  telegramId: number;
  username: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  coins: number;
  level: number;
  exp: number;
  totalCards: number;
  favorites: number[];
  freeRollsToday: number;
  maxFreeRolls: number;
  freeRollCooldownSeconds: number;
  tasksProgress: string;
}

export interface TaskItem {
  id: number;
  taskKey: string;
  title: string;
  rewardCoins: number;
  targetCount: number;
  currentProgress: number;
  isClaimed: boolean;
  canClaim: boolean;
}

export interface AlbumItem {
  id: number;
  name: string;
  description: string;
  category: string;
  required_count: number;
  reward_coins: number;
  progress: number;
  isCompleted: boolean;
}

export interface CosmeticItem {
  id: number;
  item_key: string;
  name: string;
  type: string;
  price_stars: number;
  description: string;
  preview_meta: any;
  isOwned: boolean;
}

export interface LeaderboardUser {
  rank: number;
  id: number;
  name: string;
  username: string;
  photoUrl: string;
  level: number;
  cardsCount: number;
  score: number;
}

export interface AvitaMessage {
  sender: 'avita' | 'player';
  message: string;
  timestamp: string;
}

export interface AvitaSession {
  sessionId: string;
  cards: Card[];
  initialOffer: number;
  currentOffer: number;
  maxOffer: number;
  roundsUsed: number;
  dialogHistory: AvitaMessage[];
  isLastRound: boolean;
}

export interface AvitaDeal {
  id: number;
  dealId: string;
  cardCount: number;
  cardsSummary: {
    id: number;
    bank: BankName;
    material: MaterialName;
    category: CategoryName;
    cardNumber: string;
  }[];
  finalPrice: number;
  status: string;
  createdAt: string;
}

export interface AvitaStatus {
  isBlocked: boolean;
  blockedUntil: string | null;
  secondsRemaining: number;
}

