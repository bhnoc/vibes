import { describe, it, expect, beforeEach } from 'vitest';
import {
  isExternalIPv4,
  flagEmoji,
  formatGeoLabel,
  getGeo,
  GeoInfo,
} from './geoLookup';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('geoLookup - Net-new Geo ASN and Country Label Capabilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isExternalIPv4', () => {
    it('returns false for RFC1918 private IPv4 ranges', () => {
      expect(isExternalIPv4('10.0.0.1')).toBe(false);
      expect(isExternalIPv4('10.255.255.254')).toBe(false);
      expect(isExternalIPv4('172.16.0.1')).toBe(false);
      expect(isExternalIPv4('172.31.255.254')).toBe(false);
      expect(isExternalIPv4('192.168.1.1')).toBe(false);
      expect(isExternalIPv4('192.168.100.50')).toBe(false);
    });

    it('returns false for localhost, link-local, and multicast addresses', () => {
      expect(isExternalIPv4('127.0.0.1')).toBe(false);
      expect(isExternalIPv4('169.254.10.10')).toBe(false);
      expect(isExternalIPv4('224.0.0.1')).toBe(false);
      expect(isExternalIPv4('255.255.255.255')).toBe(false);
    });

    it('returns false for non-IP host strings or invalid formats', () => {
      expect(isExternalIPv4('localhost')).toBe(false);
      expect(isExternalIPv4('client')).toBe(false);
      expect(isExternalIPv4('not-an-ip')).toBe(false);
      expect(isExternalIPv4('999.999.999.999')).toBe(false);
    });

    it('returns true for external public IPv4 addresses', () => {
      expect(isExternalIPv4('8.8.8.8')).toBe(true);
      expect(isExternalIPv4('1.1.1.1')).toBe(true);
      expect(isExternalIPv4('142.250.1.1')).toBe(true);
      expect(isExternalIPv4('54.239.28.85')).toBe(true);
    });
  });

  describe('flagEmoji', () => {
    it('converts valid ISO-3166 alpha-2 country codes to regional indicator flag emojis', () => {
      expect(flagEmoji('US')).toBe('🇺🇸');
      expect(flagEmoji('gb')).toBe('🇬🇧');
      expect(flagEmoji('CA')).toBe('🇨🇦');
    });

    it('returns empty string for invalid country code strings', () => {
      expect(flagEmoji('')).toBe('');
      expect(flagEmoji('USA')).toBe('');
      expect(flagEmoji('12')).toBe('');
    });
  });

  describe('formatGeoLabel', () => {
    it('formats label with flag emoji and ASN when present', () => {
      const info: GeoInfo = {
        countryCode: 'US',
        country: 'United States',
        asn: 'AS15169',
        asName: 'Google LLC',
        fetchedAt: Date.now(),
      };
      expect(formatGeoLabel(info)).toBe('🇺🇸 AS15169');
    });

    it('falls back to country code when flag is unavailable', () => {
      const info: GeoInfo = {
        countryCode: '??',
        country: 'Unknown',
        asn: '',
        asName: '',
        fetchedAt: Date.now(),
      };
      expect(formatGeoLabel(info)).toBe('??');
    });
  });

  describe('getGeo and cache behavior', () => {
    it('returns null for an IP that has not been looked up', () => {
      expect(getGeo('8.8.8.8')).toBeNull();
    });
  });
});
