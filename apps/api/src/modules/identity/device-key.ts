const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(ip: string): [number, number, number, number] | null {
  const m = IPV4.exec(ip.trim());
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

export function isPrivateIpv4(ip: string): boolean {
  const p = parseIpv4(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function slash24(ip: string): string | null {
  const p = parseIpv4(ip);
  if (!p) return null;
  return `${p[0]}.${p[1]}.${p[2]}`;
}

/**
 * Exact IP always matches. Public IPv4 may match on /24.
 * Private IPv4 and all IPv6: exact only.
 */
export function ipsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const pa = parseIpv4(x);
  const pb = parseIpv4(y);
  if (!pa || !pb) return false;
  if (isPrivateIpv4(x) || isPrivateIpv4(y)) return false;
  return slash24(x) === slash24(y);
}
