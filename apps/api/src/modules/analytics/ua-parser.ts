/**
 * Light-weight User-Agent parser - fara dependencies externe.
 * Acopera ~99% din browserele moderne; pentru cazuri exotice rezultatul
 * este partial (nullable).
 */

export interface ParsedUa {
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  engineName: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
  deviceVendor: string | null;
  deviceModel: string | null;
  isBot: boolean;
}

const BOT_RE =
  /bot|crawler|spider|crawling|slurp|bingbot|googlebot|yandex|duckduckbot|baiduspider|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|applebot|discordbot|preview|pingdom|monitor|uptime|headlesschrome|phantomjs|puppeteer|playwright|curl\/|wget\/|python-requests|axios\/|node-fetch|httpie/i;

export function parseUserAgent(ua: string | null): ParsedUa {
  const empty: ParsedUa = {
    browserName: null,
    browserVersion: null,
    osName: null,
    osVersion: null,
    engineName: null,
    device: 'desktop',
    deviceVendor: null,
    deviceModel: null,
    isBot: false,
  };
  if (!ua) return empty;

  const isBot = BOT_RE.test(ua);

  // Device detection
  const lc = ua.toLowerCase();
  let device: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (/ipad|tablet|playbook|silk|kindle/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    device = 'tablet';
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10/i.test(lc)) {
    device = 'mobile';
  }

  // OS detection (cea mai specifica prima)
  let osName: string | null = null;
  let osVersion: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    osName = 'Windows';
    const map: Record<string, string> = {
      '10.0': '10/11',
      '6.3': '8.1',
      '6.2': '8',
      '6.1': '7',
      '6.0': 'Vista',
      '5.1': 'XP',
    };
    osVersion = map[m[1]] ?? m[1];
  } else if ((m = ua.match(/iPhone OS ([\d_]+)/)) || (m = ua.match(/CPU OS ([\d_]+)/))) {
    osName = 'iOS';
    osVersion = m[1].replace(/_/g, '.');
  } else if ((m = ua.match(/Mac OS X ([\d_.]+)/))) {
    osName = 'macOS';
    osVersion = m[1].replace(/_/g, '.');
  } else if ((m = ua.match(/Android ([\d.]+)/))) {
    osName = 'Android';
    osVersion = m[1];
  } else if (/CrOS/.test(ua)) {
    osName = 'Chrome OS';
  } else if (/Linux/.test(ua)) {
    osName = 'Linux';
  } else if (/HarmonyOS/.test(ua)) {
    osName = 'HarmonyOS';
  }

  // Browser detection (ordinea conteaza)
  let browserName: string | null = null;
  let browserVersion: string | null = null;

  if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d.]+)/))) {
    browserName = 'Edge';
    browserVersion = m[1];
  } else if ((m = ua.match(/OPR\/([\d.]+)/)) || (m = ua.match(/Opera\/([\d.]+)/))) {
    browserName = 'Opera';
    browserVersion = m[1];
  } else if ((m = ua.match(/SamsungBrowser\/([\d.]+)/))) {
    browserName = 'Samsung Internet';
    browserVersion = m[1];
  } else if ((m = ua.match(/UCBrowser\/([\d.]+)/))) {
    browserName = 'UC Browser';
    browserVersion = m[1];
  } else if ((m = ua.match(/YaBrowser\/([\d.]+)/))) {
    browserName = 'Yandex';
    browserVersion = m[1];
  } else if ((m = ua.match(/Vivaldi\/([\d.]+)/))) {
    browserName = 'Vivaldi';
    browserVersion = m[1];
  } else if ((m = ua.match(/Brave\/([\d.]+)/))) {
    browserName = 'Brave';
    browserVersion = m[1];
  } else if ((m = ua.match(/FxiOS\/([\d.]+)/)) || (m = ua.match(/Firefox\/([\d.]+)/))) {
    browserName = 'Firefox';
    browserVersion = m[1];
  } else if ((m = ua.match(/CriOS\/([\d.]+)/)) || (m = ua.match(/Chrome\/([\d.]+)/))) {
    browserName = 'Chrome';
    browserVersion = m[1];
  } else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) {
    browserName = 'Safari';
    browserVersion = m[1];
  } else if (/Safari/.test(ua)) {
    browserName = 'Safari';
  } else if ((m = ua.match(/MSIE ([\d.]+)/)) || (m = ua.match(/Trident.*rv:([\d.]+)/))) {
    browserName = 'Internet Explorer';
    browserVersion = m[1];
  }

  // Engine
  let engineName: string | null = null;
  if (/Gecko\/\d+/.test(ua) && /Firefox/.test(ua)) engineName = 'Gecko';
  else if (/AppleWebKit/.test(ua)) {
    engineName = browserName === 'Chrome' || browserName === 'Edge' || browserName === 'Opera' || browserName === 'Brave' || browserName === 'Vivaldi' || browserName === 'Samsung Internet' || browserName === 'Yandex'
      ? 'Blink'
      : 'WebKit';
  } else if (/Trident/.test(ua)) engineName = 'Trident';

  // Device vendor/model best-effort
  let deviceVendor: string | null = null;
  let deviceModel: string | null = null;
  if (/iPhone/.test(ua)) {
    deviceVendor = 'Apple';
    deviceModel = 'iPhone';
  } else if (/iPad/.test(ua)) {
    deviceVendor = 'Apple';
    deviceModel = 'iPad';
  } else if (/iPod/.test(ua)) {
    deviceVendor = 'Apple';
    deviceModel = 'iPod';
  } else if ((m = ua.match(/;\s*([^;]+?)\s+Build\//))) {
    deviceModel = m[1].trim();
    if (/SM-|Galaxy/i.test(deviceModel)) deviceVendor = 'Samsung';
    else if (/Pixel/i.test(deviceModel)) deviceVendor = 'Google';
    else if (/HUAWEI|Honor/i.test(deviceModel)) deviceVendor = 'Huawei';
    else if (/Mi |Redmi|POCO/i.test(deviceModel)) deviceVendor = 'Xiaomi';
    else if (/OnePlus/i.test(deviceModel)) deviceVendor = 'OnePlus';
    else if (/OPPO/i.test(deviceModel)) deviceVendor = 'Oppo';
    else if (/vivo/i.test(deviceModel)) deviceVendor = 'Vivo';
  } else if (osName === 'macOS') {
    deviceVendor = 'Apple';
    deviceModel = 'Mac';
  }

  return {
    browserName,
    browserVersion,
    osName,
    osVersion,
    engineName,
    device,
    deviceVendor,
    deviceModel,
    isBot,
  };
}
