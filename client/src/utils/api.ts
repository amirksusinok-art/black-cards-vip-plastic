import { getTelegramInitData } from './telegram.js';
import {
  UserProfile,
  Card,
  CardTemplateGroup,
  TaskItem,
  AlbumItem,
  CosmeticItem,
  LeaderboardUser,
  AvitaSession,
  AvitaDeal,
  AvitaStatus,
  CaseTier,
  ClickerState,
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardMyPosition,
  GameSettings,
  AdminUserItem,
  AdminAuditLog,
  AdminStats,
  MarketListing,
  MarketDeal,
  MarketEstimate,
  MarketSellerProfile,
  PromoCode,
} from '../types.js';

const API_BASE = '/api';

let savedAdminPassword = typeof window !== 'undefined' ? localStorage.getItem('carddrop_admin_password') || '' : '';

export function setSavedAdminPassword(pw: string) {
  savedAdminPassword = pw;
  if (typeof window !== 'undefined') {
    if (pw) {
      localStorage.setItem('carddrop_admin_password', pw);
    } else {
      localStorage.removeItem('carddrop_admin_password');
    }
  }
}

export function getSavedAdminPassword(): string {
  return savedAdminPassword;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const initData = getTelegramInitData();
  if (initData) {
    headers.set('x-telegram-init-data', initData);
  }

  if (savedAdminPassword) {
    headers.set('x-admin-password', encodeURIComponent(savedAdminPassword));
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  let data: any;
  const rawText = await res.text();
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (!res.ok) {
      throw new Error(`Ошибка сервера (${res.status}): ${res.statusText || 'Сервер временно недоступен'}`);
    }
    throw new Error('Некорректный ответ сервера');
  }

  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Ошибка сервера (${res.status})`);
  }
  return data;
}

export const api = {
  getMe: () => request<{ success: boolean; user: UserProfile }>('/me'),

  issueCard: (requestId: string, tier: CaseTier = 'standard') =>
    request<{ success: boolean; card: Card; coinsRemaining: number }>('/cards/issue', {
      method: 'POST',
      body: JSON.stringify({ requestId, tier }),
    }),

  freeIssueCard: (requestId: string) =>
    request<{
      success: boolean;
      card: Card;
      freeRollsUsed: number;
      freeRollsLeft: number;
      coinsRemaining: number;
    }>('/cards/free-issue', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    }),

  autoIssueCards: (count: number, requestId: string, tier: CaseTier = 'standard') =>
    request<{
      success: boolean;
      requestedSpins: number;
      spinsCompleted: number;
      stoppedReason: string;
      coinsRemaining: number;
      cards: Card[];
    }>('/cards/auto-issue', {
      method: 'POST',
      body: JSON.stringify({ count, requestId, tier }),
    }),

  getCards: (params: {
    page?: number;
    limit?: number;
    view?: 'templates' | 'all';
    bank?: string;
    material?: string;
    category?: string;
  }) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.view) q.set('view', params.view);
    if (params.bank) q.set('bank', params.bank);
    if (params.material) q.set('material', params.material);
    if (params.category) q.set('category', params.category);

    return request<{
      success: boolean;
      viewMode: string;
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      items: any[];
    }>(`/cards?${q.toString()}`);
  },

  getCardById: (id: string | number) =>
    request<{ success: boolean; card: Card }>(`/cards/${id}`),

  addFavorite: (cardId: number) =>
    request<{ success: boolean }>(`/favorites/${cardId}`, { method: 'POST' }),

  removeFavorite: (cardId: number) =>
    request<{ success: boolean }>(`/favorites/${cardId}`, { method: 'DELETE' }),

  getTasks: () => request<{ success: boolean; tasks: TaskItem[] }>('/tasks'),

  claimTask: (id: number) =>
    request<{ success: boolean; claimedCoins: number; taskId: number }>(`/tasks/${id}/claim`, {
      method: 'POST',
    }),

  recordTaskProgress: (taskKey: string, amount: number = 1) =>
    request<{ success: boolean }>('/tasks/progress', {
      method: 'POST',
      body: JSON.stringify({ taskKey, amount }),
    }),

  getAlbums: () => request<{ success: boolean; albums: AlbumItem[] }>('/albums'),

  getShop: () => request<{ success: boolean; items: CosmeticItem[] }>('/shop'),

  createInvoice: (itemId: number) =>
    request<{
      success: boolean;
      chargeId: string;
      amount: number;
      currency: string;
      title: string;
      description: string;
      isDevTestMode: boolean;
      invoiceUrl: string | null;
    }>('/payments/stars/create', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    }),

  confirmPayment: (chargeId: string, mockConfirm = false) =>
    request<{ success: boolean; message: string }>('/payments/stars/webhook', {
      method: 'POST',
      body: JSON.stringify({ chargeId, mockConfirm }),
    }),

  // Avita Merchant Endpoints
  getAvitaStatus: () =>
    request<{ success: boolean; isBlocked: boolean; blockedUntil: string | null; secondsRemaining: number }>(
      '/avita/status'
    ),

  quoteAvita: (cardIds: number[]) =>
    request<{ success: boolean; session: AvitaSession }>('/avita/quote', {
      method: 'POST',
      body: JSON.stringify({ cardIds }),
    }),

  bargainAvita: (sessionId: string, playerDemand: number) =>
    request<{
      success: boolean;
      accepted: boolean;
      rejected: boolean;
      isBlocked: boolean;
      blockedUntil: string | null;
      secondsRemaining: number;
      newOffer: number;
      roundsUsed: number;
      isLastRound: boolean;
      dialogHistory: any[];
    }>('/avita/bargain', {
      method: 'POST',
      body: JSON.stringify({ sessionId, playerDemand }),
    }),

  acceptAvitaDeal: (sessionId: string) =>
    request<{ success: boolean; coinsEarned: number; cardsSold: number }>('/avita/accept', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  cancelAvitaDeal: (sessionId: string) =>
    request<{ success: boolean; message: string; dialogHistory: any[] }>('/avita/cancel', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  getAvitaHistory: () =>
    request<{ success: boolean; deals: AvitaDeal[] }>('/avita/history'),

  // Clicker Endpoints
  getClickerState: () =>
    request<{ success: boolean; state: ClickerState }>('/clicker/state'),

  clickerTap: (count: number = 1) =>
    request<{
      success: boolean;
      earnedCoins: number;
      coins: number;
      energy: number;
      maxEnergy: number;
      totalTaps: number;
      tapsToday: number;
    }>('/clicker/tap', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  upgradeClickerPower: () =>
    request<{
      success: boolean;
      newLevel: number;
      coinsPerTap: number;
      coinsRemaining: number;
      nextCost: number | null;
    }>('/clicker/upgrade-power', { method: 'POST' }),

  upgradeClickerEnergy: () =>
    request<{
      success: boolean;
      newLevel: number;
      secondsPerEnergy: number;
      coinsRemaining: number;
      nextCost: number | null;
    }>('/clicker/upgrade-energy', { method: 'POST' }),

  claimClickerDailyHelp: () =>
    request<{
      success: boolean;
      addedCoins: number;
      totalCoins: number;
    }>('/clicker/claim-daily-help', { method: 'POST' }),

  getLeaderboard: (category: LeaderboardCategory = 'coins') =>
    request<{
      success: boolean;
      category: LeaderboardCategory;
      top: LeaderboardEntry[];
      myPosition: LeaderboardMyPosition;
    }>(`/leaderboard?category=${category}`),

  getSettings: () =>
    request<{
      success: boolean;
      settings: GameSettings;
    }>('/settings'),

  updateSettings: (settings: Partial<GameSettings>) =>
    request<{
      success: boolean;
      settings: GameSettings;
    }>('/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),

  verifyAdmin: (password?: string) =>
    request<{
      success: boolean;
      isAdmin: boolean;
    }>('/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  getAdminUsers: (query: string = '') =>
    request<{
      success: boolean;
      users: AdminUserItem[];
    }>(`/admin/users?query=${encodeURIComponent(query)}`),

  adminAdjustBalance: (targetUserId: number, amount: number, reason: string) =>
    request<{
      success: boolean;
      prevCoins: number;
      newCoins: number;
    }>('/admin/adjust-balance', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, amount, reason }),
    }),

  adminSetPrefix: (targetUserId: number, prefix: string | null, reason?: string) =>
    request<{
      success: boolean;
      targetUserId: number;
      prefix: string | null;
    }>('/admin/set-prefix', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, prefix, reason }),
    }),

  claimClickerTask: (taskId: string) =>
    request<{
      success: boolean;
      coins: number;
      rewardCoins: number;
      claimedTaskId: string;
    }>('/clicker/claim-task', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }),

  getAdminAuditLogs: () =>
    request<{
      success: boolean;
      logs: AdminAuditLog[];
    }>('/admin/audit-logs'),

  getAdminStats: () =>
    request<{
      success: boolean;
      stats: AdminStats;
    }>('/admin/stats'),

  // Market P2P
  getMarketListings: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    bank?: string;
    material?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.bank) query.set('bank', params.bank);
    if (params?.material) query.set('material', params.material);
    if (params?.category) query.set('category', params.category);
    if (params?.minPrice) query.set('minPrice', String(params.minPrice));
    if (params?.maxPrice) query.set('maxPrice', String(params.maxPrice));
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    return request<{
      success: boolean;
      listings: MarketListing[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/market/listings?${query.toString()}`);
  },

  getMyMarketListings: () =>
    request<{
      success: boolean;
      listings: MarketListing[];
    }>('/market/my-listings'),

  getMarketHistory: () =>
    request<{
      success: boolean;
      deals: MarketDeal[];
    }>('/market/history'),

  getMarketEstimate: (cardId: number) =>
    request<{
      success: boolean;
      card: Card;
      estimate: MarketEstimate;
      feePercent: number;
      listingDurationDays: number;
      eligibility: { eligible: boolean; reason?: string };
    }>(`/market/estimate/${cardId}`),

  getMarketSellerProfile: (userId: number) =>
    request<{
      success: boolean;
      seller: MarketSellerProfile;
    }>(`/market/seller/${userId}`),

  listCardOnMarket: (cardId: number, price: number) =>
    request<{
      success: boolean;
      listing: MarketListing;
      feeInfo: { price: number; feeCoins: number; netPayout: number; feePercent: number };
    }>('/market/list', {
      method: 'POST',
      body: JSON.stringify({ cardId, price }),
    }),

  buyMarketCard: (listingId: number) =>
    request<{
      success: boolean;
      listingId: number;
      cardId: number;
      price: number;
      feeCoins: number;
      netPayout: number;
      coinsRemaining: number;
    }>('/market/buy', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),

  cancelMarketListing: (listingId: number) =>
    request<{
      success: boolean;
      message: string;
    }>('/market/cancel', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),

  updateMarketPrice: (listingId: number, newPrice: number) =>
    request<{
      success: boolean;
      listingId: number;
      newPrice: number;
      feeInfo: { price: number; feeCoins: number; netPayout: number; feePercent: number };
    }>('/market/update-price', {
      method: 'POST',
      body: JSON.stringify({ listingId, newPrice }),
    }),

  extendMarketListing: (listingId: number) =>
    request<{
      success: boolean;
      listingId: number;
      expiresAt: string;
    }>('/market/extend', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),

  // Promo Codes
  redeemPromoCode: (code: string) =>
    request<{
      success: boolean;
      rewardType: 'coins' | 'cosmetic' | 'card';
      rewardValue: string;
      message: string;
      coins: number;
    }>('/promo/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  getAdminPromos: () =>
    request<{
      success: boolean;
      promos: PromoCode[];
    }>('/admin/promos'),

  createAdminPromo: (data: {
    code: string;
    rewardType: 'coins' | 'cosmetic' | 'card';
    rewardValue: string;
    maxUses?: number;
    expiresAt?: string | null;
  }) =>
    request<{
      success: boolean;
      promo: PromoCode;
    }>('/admin/promos', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteAdminPromo: (id: number) =>
    request<{
      success: boolean;
      message: string;
    }>(`/admin/promos/${id}`, {
      method: 'DELETE',
    }),
};

