import React, { useState, useEffect } from 'react';
import { TaskItem } from '../types.js';
import { api } from '../utils/api.js';
import { hapticImpact, hapticNotification } from '../utils/telegram.js';
import confetti from 'canvas-confetti';
import { CheckCircle2, Gift, Coins, Clock } from 'lucide-react';

interface TasksViewProps {
  onRewardClaimed: () => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ onRewardClaimed }) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await api.getTasks();
      setTasks(res.tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleClaim = async (taskId: number) => {
    setClaimingId(taskId);
    hapticImpact('heavy');
    try {
      await api.claimTask(taskId);
      hapticNotification('success');
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.5 },
        colors: ['#22C55E', '#FBBF24', '#FFFFFF'],
      });
      loadTasks();
      onRewardClaimed();
    } catch (err: any) {
      alert(err.message || 'Ошибка получения награды');
      hapticNotification('error');
    } finally {
      setClaimingId(null);
    }
  };

  const totalRewardsClaimed = tasks
    .filter((t) => t.isClaimed)
    .reduce((sum, t) => sum + t.rewardCoins, 0);

  return (
    <div className="w-full flex flex-col p-4 max-w-md mx-auto select-none animate-fadeIn">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#161922] to-[#0E1017] border border-white/10 mb-4 flex items-center justify-between shadow-lg">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-emerald-400" />
            Ежедневные задания
          </h2>
          <p className="text-xs text-white/50 mt-0.5">
            Заработано сегодня: <span className="font-mono text-amber-400 font-bold">{totalRewardsClaimed} / 500 C</span>
          </p>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-white/40">
          <Clock className="w-3.5 h-3.5" />
          Сброс в 00:00
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="text-center py-12 text-white/40 font-mono text-xs">
          Загрузка заданий...
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => {
            const isCompleted = task.currentProgress >= task.targetCount;
            return (
              <div
                key={task.id}
                className="p-4 rounded-2xl bg-[#12151D] border border-white/10 flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-white">{task.title}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 font-mono text-amber-400 font-bold">
                      <Coins className="w-3 h-3" />
                      +{task.rewardCoins.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="text-white/40 font-mono">
                      ({Math.min(task.currentProgress, task.targetCount)}/{task.targetCount})
                    </span>
                  </div>
                </div>

                {/* Claim Button or Status */}
                {task.isClaimed ? (
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Получено
                  </div>
                ) : isCompleted ? (
                  <button
                    onClick={() => handleClaim(task.id)}
                    disabled={claimingId === task.id}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 active:scale-95 text-black text-xs font-bold shadow-md transition-all"
                  >
                    {claimingId === task.id ? 'Зачисление...' : 'Забрать'}
                  </button>
                ) : (
                  <div className="px-3 py-1.5 rounded-xl bg-white/5 text-white/40 text-xs font-mono">
                    В процессе
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
