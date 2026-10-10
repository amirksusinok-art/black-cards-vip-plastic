-- Migration 007: Add 4 new daily active player tasks
INSERT INTO daily_tasks (task_key, title, reward_coins, target_count, task_type) VALUES
    ('clicker_50', 'Сделать 50 кликов по монете', 100, 50, 'clicker'),
    ('sell_avita', 'Продать карту скупщику Авита', 150, 1, 'avita'),
    ('share_card', 'Поделиться картой с другом', 100, 1, 'share'),
    ('mint_rare', 'Выбить карту Gold или выше', 250, 1, 'mint_rare')
ON CONFLICT (task_key) DO NOTHING;
