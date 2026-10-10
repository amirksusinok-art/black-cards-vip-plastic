export type BankName = 'Алфа Банк' | 'ЗверьБанк' | 'ОзановБанк' | 'Тинькоффи' | 'ОООтмыв Банк';

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
