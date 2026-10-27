import { describe, it, expect } from 'vitest';
import {
  ALL_BANGLADESH_LOCATIONS,
  BANGLADESH_DISTRICT_UPAZILA_MAP,
  formatCityDistrict,
} from '../src/data/bangladeshAreas';

describe('District / City Display Order Suite', () => {
  it('formats locations such that the district name appears after the city name in displayName', () => {
    // Find sample locations across multiple districts
    const uttara = ALL_BANGLADESH_LOCATIONS.find(
      (loc) => loc.district === 'Dhaka' && loc.upazila === 'Uttara'
    );
    expect(uttara).toBeDefined();
    expect(uttara?.displayName).toBe('Uttara - Dhaka');

    const sherpurBogura = ALL_BANGLADESH_LOCATIONS.find(
      (loc) => loc.district === 'Bogura' && loc.upazila === 'Sherpur'
    );
    expect(sherpurBogura).toBeDefined();
    expect(sherpurBogura?.displayName).toBe('Sherpur - Bogura');

    const agrabad = ALL_BANGLADESH_LOCATIONS.find(
      (loc) => loc.district === 'Chattogram' && loc.upazila === 'Halishahar'
    );
    expect(agrabad).toBeDefined();
    expect(agrabad?.displayName).toBe('Halishahar - Chattogram');
  });

  it('keeps Main City display clean as district name', () => {
    const dhakaMain = ALL_BANGLADESH_LOCATIONS.find(
      (loc) => loc.district === 'Dhaka' && loc.upazila === 'Main City'
    );
    expect(dhakaMain).toBeDefined();
    expect(dhakaMain?.displayName).toBe('Dhaka');
  });

  it('correctly transforms legacy "District - City" strings to "City - District"', () => {
    expect(formatCityDistrict('Dhaka - Uttara')).toBe('Uttara - Dhaka');
    expect(formatCityDistrict('Bogura - Sherpur')).toBe('Sherpur - Bogura');
    expect(formatCityDistrict('Chattogram - Pahartali')).toBe('Pahartali - Chattogram');
  });

  it('preserves already normalized "City - District" strings without double formatting', () => {
    expect(formatCityDistrict('Uttara - Dhaka')).toBe('Uttara - Dhaka');
    expect(formatCityDistrict('Sherpur - Bogura')).toBe('Sherpur - Bogura');
    expect(formatCityDistrict('Pahartali - Chattogram')).toBe('Pahartali - Chattogram');
  });

  it('safely handles empty, null, undefined, or district-only inputs', () => {
    expect(formatCityDistrict('')).toBe('');
    expect(formatCityDistrict(null)).toBe('');
    expect(formatCityDistrict(undefined)).toBe('');
    expect(formatCityDistrict('Dhaka')).toBe('Dhaka');
    expect(formatCityDistrict('Bogura')).toBe('Bogura');
  });
});
