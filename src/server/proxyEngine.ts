import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export interface ProxyItem {
  id: string;
  url: string;
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  auth?: string;
  latency?: number;
  status: 'active' | 'testing' | 'dead' | 'untested';
}

export interface ProxyConfig {
  enabled: boolean;
  mode: 'auto' | 'custom';
  customProxies: string[];
}

// Built-in pool of high-speed rotating proxy endpoints (public & free reliable nodes)
const BUILT_IN_PROXIES: string[] = [
  'http://154.236.177.106:1981',
  'http://198.24.162.242:80',
  'http://103.152.112.162:80',
  'http://198.59.191.234:8080',
  'http://47.88.29.98:8080',
  'http://8.219.97.248:80',
  'http://159.203.61.169:3128',
];

let globalProxyConfig: ProxyConfig = {
  enabled: false,
  mode: 'auto',
  customProxies: [],
};

let currentProxyIndex = 0;

export function getProxyConfig(): ProxyConfig {
  return globalProxyConfig;
}

export function setProxyConfig(config: Partial<ProxyConfig>): ProxyConfig {
  globalProxyConfig = { ...globalProxyConfig, ...config };
  return globalProxyConfig;
}

export function getNextProxyUrl(): string | null {
  if (!globalProxyConfig.enabled) return null;

  const pool =
    globalProxyConfig.mode === 'custom' && globalProxyConfig.customProxies.length > 0
      ? globalProxyConfig.customProxies
      : BUILT_IN_PROXIES;

  if (pool.length === 0) return null;

  const proxy = pool[currentProxyIndex % pool.length];
  currentProxyIndex++;
  return proxy;
}

export function getProxyAgent(proxyUrl: string | null): any {
  if (!proxyUrl) return undefined;
  try {
    if (proxyUrl.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    }
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

export async function testProxyLatency(proxyUrl: string): Promise<{ success: boolean; latency: number; ip?: string; error?: string }> {
  const start = Date.now();
  try {
    const agent = getProxyAgent(proxyUrl);
    const res = await fetch('https://api.ipify.org?format=json', {
      // @ts-ignore
      agent,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const latency = Date.now() - start;
      return { success: true, latency, ip: data.ip };
    }
    return { success: false, latency: Date.now() - start, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, latency: Date.now() - start, error: err?.message || 'Connection timeout' };
  }
}
