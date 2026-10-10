import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Search,
  Coins,
  Users,
  CreditCard,
  Activity,
  History,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Minus,
  RefreshCw,
  Terminal,
  Gift,
  Trash2,
} from 'lucide-react';
import { AdminUserItem, AdminAuditLog, AdminStats, PromoCode } from '../types.js';
import { api } from '../utils/api.js';
import { hapticSelection, hapticNotification } from '../utils/telegram.js';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshGlobalUser?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, onRefreshGlobalUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'promos' | 'logs' | 'stats'>('users');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Promo code creation state
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoType, setNewPromoType] = useState<'coins' | 'cosmetic' | 'card'>('coins');
  const [newPromoValue, setNewPromoValue] = useState('5000');
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('0');
  const [creatingPromo, setCreatingPromo] = useState(false);

  // Balance adjustment modal state
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjusting, setAdjusting] = useState(false);

  // User prefix modal state
  const [prefixUser, setPrefixUser] = useState<AdminUserItem | null>(null);
  const [userPrefixInput, setUserPrefixInput] = useState<string>('');
  const [savingPrefix, setSavingPrefix] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes, logsRes, promosRes] = await Promise.all([
        api.getAdminStats().catch(() => ({ stats: null })),
        api.getAdminUsers(searchQuery).catch(() => ({ users: [] })),
        api.getAdminAuditLogs().catch(() => ({ logs: [] })),
        api.getAdminPromos().catch(() => ({ promos: [] })),
      ]);

      if (statsRes.stats) setStats(statsRes.stats);
      if (usersRes.users) setUsers(usersRes.users);
      if (logsRes.logs) setAuditLogs(logsRes.logs);
      if (promosRes.promos) setPromos(promosRes.promos);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Ошибка загрузки админ-панели' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newPromoCode.trim().toUpperCase();
    if (!code) {
      setActionMessage({ type: 'error', text: 'Укажите код промокода' });
      return;
    }

    try {
      setCreatingPromo(true);
      hapticSelection();
      await api.createAdminPromo({
        code,
        rewardType: newPromoType,
        rewardValue: newPromoValue,
        maxUses: parseInt(newPromoMaxUses, 10) || 0,
      });
      hapticNotification('success');
      setActionMessage({ type: 'success', text: `Промокод ${code} успешно создан!` });
      setNewPromoCode('');
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Ошибка создания промокода' });
      hapticNotification('error');
    } finally {
      setCreatingPromo(false);
    }
  };

  const handleDeletePromo = async (promoId: number) => {
    try {
      hapticSelection();
      // Optimistic local remove so UI updates immediately
      setPromos((prev) => prev.filter((p) => p.id !== promoId));
      await api.deleteAdminPromo(promoId);
      hapticNotification('success');
      setActionMessage({ type: 'success', text: 'Промокод успешно удален' });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Ошибка удаления промокода' });
      hapticNotification('error');
      loadData();
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    hapticSelection();
    api.getAdminUsers(searchQuery).then((res) => {
      if (res.users) setUsers(res.users);
    });
  };

  const handleAdjustBalance = async () => {
    if (!selectedUser) return;
    const amountNum = parseInt(adjustAmount, 10);
    if (isNaN(amountNum) || amountNum === 0) {
      setActionMessage({ type: 'error', text: 'Укажите корректную сумму монет (например, 1000 или -500)' });
      return;
    }
    if (!adjustReason || adjustReason.trim().length < 3) {
      setActionMessage({ type: 'error', text: 'Укажите понятную причину корректировки (минимум 3 символа)' });
      return;
    }

    try {
      setAdjusting(true);
      hapticSelection();
      const res = await api.adminAdjustBalance(selectedUser.id, amountNum, adjustReason.trim());
      hapticNotification('success');
      setActionMessage({
        type: 'success',
        text: `Баланс игрока ${selectedUser.username || selectedUser.id} изменён: ${res.newCoins.toLocaleString('ru-RU')} ₽`,
      });
      setSelectedUser(null);
      setAdjustAmount('');
      setAdjustReason('');
      loadData();
      if (onRefreshGlobalUser) onRefreshGlobalUser();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Ошибка изменения баланса' });
      hapticNotification('error');
    } finally {
      setAdjusting(false);
    }
  };

  const handleSavePrefix = async (prefixToSet?: string | null) => {
    if (!prefixUser) return;
    const finalPrefix = prefixToSet !== undefined ? prefixToSet : userPrefixInput.trim();
    try {
      setSavingPrefix(true);
      hapticSelection();
      await api.adminSetPrefix(
        prefixUser.id,
        finalPrefix || null,
        `Установка префикса: ${finalPrefix ? `[${finalPrefix}]` : 'сброшен'}`
      );
      hapticNotification('success');
      setActionMessage({
        type: 'success',
        text: `Префикс игрока ${prefixUser.firstName || prefixUser.username} обновлен: ${
          finalPrefix ? `[${finalPrefix}]` : 'сброшен'
        }`,
      });
      setPrefixUser(null);
      setUserPrefixInput('');
      loadData();
      if (onRefreshGlobalUser) onRefreshGlobalUser();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Ошибка обновления префикса' });
      hapticNotification('error');
    } finally {
      setSavingPrefix(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md animate-fadeIn select-none p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#0D0F17] border border-amber-500/30 p-5 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Панель администратора
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">ROOT</span>
              </h2>
              <span className="text-[10px] text-white/40">Управление экономикой и журнал аудита</span>
            </div>
          </div>
          <button
            onClick={() => {
              hapticSelection();
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Notification Banner */}
        {actionMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/70 border-red-500/40 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="p-1 hover:text-white">✕</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#141722] border border-white/5">
          <button
            onClick={() => {
              hapticSelection();
              setActiveTab('users');
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'users' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-white/50'
            }`}
          >
            Игроки
          </button>
          <button
            onClick={() => {
              hapticSelection();
              setActiveTab('promos');
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'promos' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-white/50'
            }`}
          >
            Промокоды
          </button>
          <button
            onClick={() => {
              hapticSelection();
              setActiveTab('logs');
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'logs' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-white/50'
            }`}
          >
            Аудит
          </button>
          <button
            onClick={() => {
              hapticSelection();
              setActiveTab('stats');
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'stats' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-white/50'
            }`}
          >
            Инфо
          </button>
        </div>

        {/* TAB 1: USERS & BALANCE ADJUSTMENT */}
        {activeTab === 'users' && (
          <div className="flex flex-col gap-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск по ID, username или имени..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#141724] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors shrink-0"
              >
                Найти
              </button>
            </form>

            {/* Users List */}
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#141724] border border-white/5 text-xs"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-white truncate">{u.firstName || u.username}</span>
                      {u.prefix && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
                          {u.prefix}
                        </span>
                      )}
                      <span className="text-[10px] text-white/40">#{u.id}</span>
                    </div>
                    <span className="text-[10px] text-white/40 truncate">TG ID: {u.telegramId} • Карт: {u.cardsCount}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold text-amber-300 mr-1">{u.coins.toLocaleString('ru-RU')} ₽</span>
                    <button
                      onClick={() => {
                        hapticSelection();
                        setPrefixUser(u);
                        setUserPrefixInput(u.prefix || '');
                        setSelectedUser(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-[10px] font-bold"
                    >
                      Префикс
                    </button>
                    <button
                      onClick={() => {
                        hapticSelection();
                        setSelectedUser(u);
                        setAdjustAmount('');
                        setAdjustReason('');
                        setPrefixUser(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold"
                    >
                      Изменить ₽
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Prefix Modal Dialog */}
            {prefixUser && (
              <div className="p-3.5 rounded-2xl bg-[#1A1D2C] border border-blue-500/50 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Префикс игрока: {prefixUser.firstName || prefixUser.username} (#{prefixUser.id})
                  </span>
                  <button onClick={() => setPrefixUser(null)} className="text-white/40 hover:text-white">✕</button>
                </div>
                <div className="text-[11px] text-white/50">
                  Текущий: {prefixUser.prefix ? <span className="text-amber-300 font-bold">[{prefixUser.prefix}]</span> : <span className="text-white/40">нет префикса</span>}
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {['VIP', 'WHALE', 'DEV', 'ROOT', 'TOP', 'TESTER'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setUserPrefixInput(preset)}
                      className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors ${
                        userPrefixInput === preset
                          ? 'bg-blue-500 text-black border-blue-400'
                          : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Введите префикс (например: VIP, DEV, СКУПЩИК)..."
                  value={userPrefixInput}
                  onChange={(e) => setUserPrefixInput(e.target.value)}
                  maxLength={32}
                  className="w-full bg-[#10121A] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30"
                />

                <div className="flex justify-between items-center mt-1">
                  <button
                    type="button"
                    onClick={() => handleSavePrefix(null)}
                    disabled={savingPrefix || !prefixUser.prefix}
                    className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs disabled:opacity-40"
                  >
                    Очистить
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPrefixUser(null)}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/80"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => handleSavePrefix()}
                      disabled={savingPrefix}
                      className="px-4 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-black font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {savingPrefix ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Adjust Modal Dialog */}
            {selectedUser && (
              <div className="p-3.5 rounded-2xl bg-[#1A1D2C] border border-amber-500/50 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Корректировка баланса: {selectedUser.firstName || selectedUser.username} (#{selectedUser.id})
                  </span>
                  <button onClick={() => setSelectedUser(null)} className="text-white/40 hover:text-white">✕</button>
                </div>
                <div className="text-[11px] text-white/50">
                  Текущий баланс: <strong className="text-white font-bold">{selectedUser.coins.toLocaleString('ru-RU')} ₽</strong>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Сумма (+500 или -200)"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="flex-1 bg-[#10121A] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAdjustAmount('500')}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white/80"
                    >
                      +500
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAmount('2000')}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white/80"
                    >
                      +2000
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Обязательная причина (для журнала аудита)..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-[#10121A] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30"
                />

                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/80"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleAdjustBalance}
                    disabled={adjusting}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    {adjusting ? 'Сохранение...' : 'Применить'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: PROMO CODES */}
        {activeTab === 'promos' && (
          <div className="flex flex-col gap-3">
            {/* Create Promo Code Form */}
            <form onSubmit={handleCreatePromo} className="p-3.5 rounded-2xl bg-[#141724] border border-white/10 flex flex-col gap-2.5">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                Создать новый промокод
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-white/50">Код промокода</label>
                  <input
                    type="text"
                    placeholder="WINTER5000"
                    value={newPromoCode}
                    onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                    className="bg-[#0E1017] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-white/50">Тип награды</label>
                  <select
                    value={newPromoType}
                    onChange={(e: any) => {
                      setNewPromoType(e.target.value);
                      if (e.target.value === 'coins') setNewPromoValue('5000');
                      else if (e.target.value === 'cosmetic') setNewPromoValue('bg_luxury_onyx');
                      else setNewPromoValue('gold');
                    }}
                    className="bg-[#0E1017] border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="coins">Монеты (₽)</option>
                    <option value="cosmetic">Оформление (Item)</option>
                    <option value="card">Карта (Card)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-white/50">
                    {newPromoType === 'coins' ? 'Сумма монет (₽)' : newPromoType === 'cosmetic' ? 'Ключ предмета' : 'Тир (gold/titanium)'}
                  </label>
                  <input
                    type="text"
                    value={newPromoValue}
                    onChange={(e) => setNewPromoValue(e.target.value)}
                    className="bg-[#0E1017] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-white/50">Лимит активаций (0 = ∞)</label>
                  <input
                    type="number"
                    min="0"
                    value={newPromoMaxUses}
                    onChange={(e) => setNewPromoMaxUses(e.target.value)}
                    className="bg-[#0E1017] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingPromo || !newPromoCode.trim()}
                className="mt-1 w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingPromo ? 'Создание...' : 'Добавить промокод'}</span>
              </button>
            </form>

            {/* Existing Promo Codes List */}
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              <span className="text-[11px] text-white/50 px-1 uppercase tracking-wider font-bold">
                Активные промокоды ({promos.length})
              </span>

              {promos.length === 0 ? (
                <div className="py-6 text-center text-xs text-white/40">Промокодов пока нет</div>
              ) : (
                promos.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#141724] border border-white/5 text-xs"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-300 font-mono text-sm">{p.code}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-white/10 text-white/70">
                          {p.reward_type}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 mt-0.5">
                        Награда: <strong className="text-white/80">{p.reward_value}</strong> • Использовано:{' '}
                        {p.uses_count} / {p.max_uses > 0 ? p.max_uses : '∞'}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeletePromo(p.id)}
                      className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
                      title="Удалить промокод"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-white/40">Журнал событий пуст</div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col p-2.5 rounded-xl bg-[#141724] border border-white/5 text-[11px] gap-1"
                >
                  <div className="flex items-center justify-between text-white/40 text-[10px]">
                    <span className="text-amber-400 font-bold uppercase">{log.action}</span>
                    <span>{new Date(log.created_at).toLocaleString('ru-RU')}</span>
                  </div>
                  <div className="text-white">
                    Целевой игрок ID: <strong className="text-amber-300">#{log.target_user_id}</strong> • Админ TG: {log.admin_telegram_id}
                  </div>
                  <div className="text-white/70 italic bg-black/30 px-2 py-1 rounded border border-white/5">
                    «{log.reason}»
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: PLATFORM STATS */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-2xl bg-[#141724] border border-white/5 flex flex-col gap-1">
              <span className="text-white/40 text-[10px]">Всего игроков</span>
              <span className="text-lg font-bold text-white">{(stats?.totalUsers || 0).toLocaleString('ru-RU')}</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#141724] border border-white/5 flex flex-col gap-1">
              <span className="text-white/40 text-[10px]">Выпущено карт</span>
              <span className="text-lg font-bold text-cyan-400">{(stats?.totalCards || 0).toLocaleString('ru-RU')}</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#141724] border border-white/5 flex flex-col gap-1">
              <span className="text-white/40 text-[10px]">Монет в экономике</span>
              <span className="text-lg font-bold text-amber-300">{(stats?.totalCoins || 0).toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#141724] border border-white/5 flex flex-col gap-1">
              <span className="text-white/40 text-[10px]">Всего кликов</span>
              <span className="text-lg font-bold text-emerald-400">{(stats?.totalClicks || 0).toLocaleString('ru-RU')}</span>
            </div>
          </div>
        )}

        {/* Instructions footer */}
        <div className="border-t border-white/10 pt-2 text-[10px] text-white/40">
          💡 Для автоматического доступа без пароля добавьте свой Telegram ID в файл <code>.env</code>: <br />
          <code>ADMIN_TELEGRAM_IDS=123456789</code>
        </div>
      </div>
    </div>
  );
};
