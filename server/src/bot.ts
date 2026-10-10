import express from 'express';
import { query, withTransaction } from './db.js';

/**
 * Telegram Bot integration:
 * - /start command with WebApp launch button
 * - pre_checkout_query answering for Telegram Stars
 * - successful_payment fulfillment
 */
export function setupTelegramBot(app: express.Express) {
  const token = process.env.BOT_TOKEN;
  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://black-cards-vip-plastic.onrender.com';

  if (!token) {
    console.log('[Telegram Bot] BOT_TOKEN is not set. Bot webhook/polling skipped.');
    return;
  }

  console.log('[Telegram Bot] Initializing Bot handlers with token...');

  // Helper to send messages via Telegram Bot API
  async function sendMessage(chatId: number | string, text: string, replyMarkup?: any) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });
    } catch (err) {
      console.error('[Telegram Bot] Error sending message:', err);
    }
  }

  // Helper to answer pre_checkout_query (Mandatory for Telegram Stars!)
  async function answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: preCheckoutQueryId,
          ok,
          error_message: errorMessage,
        }),
      });
    } catch (err) {
      console.error('[Telegram Bot] Error answering pre_checkout_query:', err);
    }
  }

  // Webhook handler for Telegram updates
  app.post('/api/telegram/webhook', async (req, res) => {
    res.sendStatus(200);

    const update = req.body;
    if (!update) return;

    try {
      // 1. Handle pre_checkout_query (Telegram Stars payment confirmation)
      if (update.pre_checkout_query) {
        const pcq = update.pre_checkout_query;
        console.log(`[Telegram Stars] Received pre_checkout_query: ${pcq.id}, payload: ${pcq.invoice_payload}`);
        await answerPreCheckoutQuery(pcq.id, true);
        return;
      }

      // 2. Handle message
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat?.id;
        const text = msg.text || '';
        const user = msg.from;

        // Check for successful payment
        if (msg.successful_payment) {
          const sp = msg.successful_payment;
          const chargeId = sp.invoice_payload;
          const telegramPaymentChargeId = sp.telegram_payment_charge_id;

          console.log(`[Telegram Stars] Payment successful: ${chargeId}, amount: ${sp.total_amount} XTR`);

          // Complete payment in DB
          if (chargeId) {
            try {
              const paymentRes = await query('SELECT * FROM star_payments WHERE payment_charge_id = $1', [chargeId]);
              if (paymentRes.rowCount > 0) {
                const payment = paymentRes.rows[0];
                await withTransaction(async (client) => {
                  await client.query(
                    `UPDATE star_payments
                     SET status = 'completed', telegram_payment_charge_id = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [telegramPaymentChargeId, payment.id]
                  );
                  await client.query(
                    `INSERT INTO user_cosmetics (user_id, item_id, is_equipped)
                     VALUES ($1, $2, true)
                     ON CONFLICT (user_id, item_id) DO NOTHING`,
                    [payment.user_id, payment.item_id]
                  );
                });
              }
            } catch (pErr) {
              console.error('[Telegram Stars] DB completion error:', pErr);
            }
          }

          await sendMessage(
            chatId,
            `⭐️ <b>Оплата Telegram Stars успешно подтверждена!</b>\n\nВаш косметический предмет активирован в игре <b>CardDrop</b>. Заходите и наслаждайтесь оформлением!`
          );
          return;
        }

        // Handle /start command
        if (text.startsWith('/start')) {
          const welcomeText = `💳 <b>Добро пожаловать в CardDrop — Black Cards & VIP Plastic!</b>\n\n` +
            `Эксклюзивный симулятор коллекционирования премиальных банковских карт прямо в Telegram:\n\n` +
            `⚡️ <b>5 банков и 6 редких материалов:</b> от классического пластика до Титана и Голографика!\n` +
            `🎲 <b>Редкие номера:</b> собирайте Зеркала, Каре, Стриты и Тройки\n` +
            `🤝 <b>Скупщик «Авита» & P2P Рынок:</b> торгуйтесь за монеты или покупайте карты у игроков\n` +
            `⭐️ <b>Telegram Stars:</b> VIP-рамки, карбоновые холдеры и неоновые спецэффекты\n` +
            `💎 <b>Бесплатный режим:</b> 150 бесплатных выпусков в сутки при нулевом балансе\n\n` +
            `💬 Вы можете задать вопрос в поддержку написав @stena10\n` +
            `💡 Вы можете предложить идею написав @stena10\n\n` +
            `Нажмите кнопку ниже, чтобы запустить Mini App 👇`;

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '💳 Открыть CardDrop',
                  web_app: { url: appUrl },
                },
              ],
              [
                {
                  text: '💬 Поддержка',
                  url: 'https://t.me/stena10',
                },
                {
                  text: '💡 Предложить идею',
                  url: 'https://t.me/stena10',
                },
              ],
            ],
          };

          await sendMessage(chatId, welcomeText, keyboard);
          return;
        }

        // Default response for other messages
        if (chatId) {
          await sendMessage(
            chatId,
            `Чтобы начать коллекционировать карты, нажмите кнопку ниже 👇\n\n` +
              `💬 Вы можете задать вопрос в поддержку написав @stena10\n` +
              `💡 Вы можете предложить идею написав @stena10`,
            {
              inline_keyboard: [
                [{ text: '💳 Запустить CardDrop', web_app: { url: appUrl } }],
                [
                  { text: '💬 Поддержка', url: 'https://t.me/stena10' },
                  { text: '💡 Предложить идею', url: 'https://t.me/stena10' },
                ],
              ],
            }
          );
        }
      }
    } catch (err) {
      console.error('[Telegram Bot] Webhook processing error:', err);
    }
  });

  // Attempt to set webhook if in production
  if (process.env.NODE_ENV === 'production' && appUrl.startsWith('https://')) {
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
      .then((r) => r.json())
      .then((data: any) => {
        if (data.ok) {
          console.log(`[Telegram Bot] Webhook set to: ${webhookUrl}`);
        } else {
          console.warn('[Telegram Bot] Failed to set webhook:', data);
        }
      })
      .catch((err) => console.warn('[Telegram Bot] Error setting webhook:', err));
  }
}
