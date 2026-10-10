import { getTelegramInitData } from './telegram.js';
import { UserProfile, Card, CardTemplateGroup, TaskItem, AlbumItem, CosmeticItem, LeaderboardUser } from '../types.js';

const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const initData = getTelegramInitData();
  if (initData) {
    headers.set('x-telegram-init-data', initData);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Ошибка запроса к серверу');
  }
  return data;
}

export const api = {
  getMe: () => request<{ success: boolean; user: UserProfile }>('/me'),

  issueCard: (requestId: string) =>
    request<{ success: boolean; card: Card; coinsRemaining: number }>('/cards/issue', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
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

  autoIssueCards: (count: number, requestId: string) =>
    request<{
      success: boolean;
      requestedSpins: number;
      spinsCompleted: number;
      stoppedReason: string;
      coinsRemaining: number;
      cards: Card[];
    }>('/cards/auto-issue', {
      method: 'POST',
      body: JSON.stringify({ count, requestId }),
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

  getLeaderboard: () =>
    request<{ success: boolean; leaderboard: LeaderboardUser[] }>('/leaderboard'),
};
