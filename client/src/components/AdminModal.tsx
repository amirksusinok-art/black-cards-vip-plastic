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
} from 'lucide-react';
import { AdminUserItem, AdminAuditLog, AdminStats } from '../types.js';
import { api } from '../utils/api.js';
import { hapticSelection, hapticNotification } from '../utils/telegram.js';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshGlobalUser?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, onRefreshGlobalUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'logs' | 'stats'>('users');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Balance adjustment modal state
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjusting, setAdjusting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes, logsRes] = await Promise.all([
        api.getAdminStats().catch(() => ({ stats: null })),
        api.getAdminUsers(searchQuery).catch(() => ({ users: [] })),
        api.getAdminAuditLogs().catch(() => ({ logs: [] })),
      ]);

      if (statsRes.stats) setStats(statsRes.stats);
      if (usersRes.users) setUsers(usersRes.users);
      if (logsRes.logs) setAuditLogs(logsRes.logs);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Ошибка загрузки админ-панели' });
    } finally {
      setLoading(false);
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
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#141722] border border-white/5">
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
              setActiveTab('logs');
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'logs' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-white/50'
            }`}
          >
            Журнал аудита
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
            Статистика
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
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white truncate">{u.firstName || u.username}</span>
                      <span className="text-[10px] text-white/40">#{u.id}</span>
                    </div>
                    <span className="text-[10px] text-white/40 truncate">TG ID: {u.telegramId} • Карт: {u.cardsCount}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-amber-300">{u.coins.toLocaleString('ru-RU')} ₽</span>
                    <button
                      onClick={() => {
                        hapticSelection();
                        setSelectedUser(u);
                        setAdjustAmount('');
                        setAdjustReason('');
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold"
                    >
                      Изменить ₽
                    </button>
                  </div>
                </div>
              ))}
            </div>

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
