import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ipsCompatible, isPrivateIpv4 } from './device-key';

describe('ipsCompatible', () => {
  it('matches exact IPv4', () => {
    assert.equal(ipsCompatible('1.2.3.4', '1.2.3.4'), true);
  });

  it('matches public IPv4 on the same /24', () => {
    assert.equal(ipsCompatible('86.120.10.4', '86.120.10.99'), true);
  });

  it('rejects public IPv4 on a different /24', () => {
    assert.equal(ipsCompatible('86.120.10.4', '86.120.11.4'), false);
  });

  it('rejects private IPv4 /24 (two 192.168 hosts)', () => {
    assert.equal(ipsCompatible('192.168.1.10', '192.168.1.20'), false);
  });

  it('matches private IPv4 only when exact', () => {
    assert.equal(ipsCompatible('192.168.1.10', '192.168.1.10'), true);
    assert.equal(isPrivateIpv4('10.0.0.5'), true);
    assert.equal(ipsCompatible('10.0.0.5', '10.0.0.6'), false);
  });

  it('IPv6 matches exact only', () => {
    assert.equal(ipsCompatible('2001:db8::1', '2001:db8::1'), true);
    assert.equal(ipsCompatible('2001:db8::1', '2001:db8::2'), false);
  });

  it('rejects empty or null', () => {
    assert.equal(ipsCompatible(null, '1.2.3.4'), false);
    assert.equal(ipsCompatible('', '1.2.3.4'), false);
  });
});
