import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface AuthenticatedRequest extends Request {
  telegramUser?: TelegramUser;
}

/**
 * Validates Telegram initData according to official TMA specification:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(initData: string, botToken: string): TelegramUser | null {
  if (!initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    // Sort keys alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // calculated_hash = HMAC_SHA256(secret_key, data_check_string)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return null;
    }

    const userParam = params.get('user');
    if (userParam) {
      return JSON.parse(userParam) as TelegramUser;
    }

    return null;
  } catch (err) {
    console.error('Error validating initData:', err);
    return null;
  }
}

/**
 * Express Middleware for Auth
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const initData = (req.headers['x-telegram-init-data'] as string) || (req.query.initData as string);
  const botToken = process.env.BOT_TOKEN;

  // 1. Check genuine Telegram initData if botToken is set
  if (botToken && initData) {
    const validUser = validateTelegramInitData(initData, botToken);
    if (validUser) {
      req.telegramUser = validUser;
      return next();
    }
  }

  // 2. Dev & Test mode bypass when running locally or BOT_TOKEN not configured
  if (process.env.NODE_ENV !== 'production' || !botToken) {
    // If dev initData contains mock user or header is mock
    if (initData) {
      try {
        const params = new URLSearchParams(initData);
        const userParam = params.get('user');
        if (userParam) {
          req.telegramUser = JSON.parse(userParam);
          return next();
        }
      } catch {
        // ignore and fall through
      }
    }

    // Default development fallback user
    req.telegramUser = {
      id: 777000123,
      username: 'vip_collector',
      first_name: 'VIP',
      last_name: 'Collector',
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Invalid Telegram credentials',
  });
}
