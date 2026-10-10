import { describe, it, expect } from 'vitest';
import { validateCourierApiDestination } from '../src/server/ssrf';

describe('Steadfast URL Validator', () => {
  it('allows https://portal.packzy.com/api/v1 (Pass)', () => {
    const result = validateCourierApiDestination('https://portal.packzy.com/api/v1', { courierType: 'steadfast' });
    expect(result.valid).toBe(true);
  });

  it('allows https://portal.packzy.com/api/v1/ with trailing slash (Pass)', () => {
    const result = validateCourierApiDestination('https://portal.packzy.com/api/v1/', { courierType: 'steadfast' });
    expect(result.valid).toBe(true);
  });

  it('allows and normalizes https://portal.steadfast.com.bd/api/v1 (Pass - normalized)', () => {
    const result = validateCourierApiDestination('https://portal.steadfast.com.bd/api/v1', { courierType: 'steadfast' });
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://portal.packzy.com/api/v1');
  });

  it('blocks https://attacker.com/api/v1 (Blocked)', () => {
    const result = validateCourierApiDestination('https://attacker.com/api/v1', { courierType: 'steadfast' });
    expect(result.valid).toBe(false);
  });

  it('blocks https://portal.packzy.com.attacker.com (Blocked)', () => {
    const result = validateCourierApiDestination('https://portal.packzy.com.attacker.com', { courierType: 'steadfast' });
    expect(result.valid).toBe(false);
  });

  it('blocks http://localhost:8080 (Blocked)', () => {
    const result = validateCourierApiDestination('http://localhost:8080', { courierType: 'steadfast' });
    expect(result.valid).toBe(false);
  });

  it('accepts direct subpath /create_order (Pass)', () => {
    const result = validateCourierApiDestination('/create_order', { courierType: 'steadfast' });
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://portal.packzy.com/api/v1');
  });

  it('accepts direct subpath /status_by_cid (Pass)', () => {
    const result = validateCourierApiDestination('/status_by_cid', { courierType: 'steadfast' });
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://portal.packzy.com/api/v1');
  });

  it('safely falls back to canonical gateway on empty input for Steadfast (Pass)', () => {
    const result = validateCourierApiDestination('', { courierType: 'steadfast' });
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://portal.packzy.com/api/v1');
  });
});
