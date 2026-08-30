/**
 * Unit Tests for Compensation Input Engine (INCREMENT 2)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMoveTime,
  calculateDistanceMiles,
  resolveZone,
  resolveMarket,
  resolvePolicy,
  MOVE_TIME_CONSTANTS,
  NoPolicyFoundError,
  DEFAULT_AIRPORT_MARKET_MAPPINGS,
  calculateEffectiveMultiplier,
  calculateAdjustedPay,
  dollarsToCents,
  calculateBasePayCents,
  applyGuardrails,
  calculatePayLine,
  aggregatePayPeriod,
  MULTIPLIER_CLAMP,
} from './compensationEngine';
import type { Zone, Market, PolicyVersion, WorkType } from '@shared/schema';

// ============================================
// 1. MOVE TIME CALCULATION TESTS
// ============================================

describe('calculateMoveTime', () => {
  it('should calculate total time with fixed wait times', () => {
    const result = calculateMoveTime({ estimatedDriveMinutes: 60 });
    
    expect(result.estimatedDriveMinutes).toBe(60);
    expect(result.pickupWait).toBe(MOVE_TIME_CONSTANTS.PICKUP_WAIT);
    expect(result.dropWait).toBe(MOVE_TIME_CONSTANTS.DROP_WAIT);
    expect(result.returnTime).toBe(MOVE_TIME_CONSTANTS.RETURN_TIME);
    expect(result.estimatedMinutesTotal).toBe(60 + 10 + 10 + 8); // 88
  });

  it('should handle zero drive minutes', () => {
    const result = calculateMoveTime({ estimatedDriveMinutes: 0 });
    
    expect(result.estimatedMinutesTotal).toBe(0 + 10 + 10 + 8); // 28
  });

  it('should handle large drive times', () => {
    const result = calculateMoveTime({ estimatedDriveMinutes: 480 }); // 8 hours
    
    expect(result.estimatedMinutesTotal).toBe(480 + 10 + 10 + 8); // 508
  });

  it('should throw error for negative drive minutes', () => {
    expect(() => calculateMoveTime({ estimatedDriveMinutes: -10 }))
      .toThrow('estimatedDriveMinutes cannot be negative');
  });
});

// ============================================
// 2. ZONE RESOLUTION TESTS
// ============================================

describe('calculateDistanceMiles', () => {
  it('should calculate distance between two points', () => {
    // DFW Airport to downtown Dallas (~18 miles)
    const dfw = { latitude: 32.8998, longitude: -97.0403 };
    const downtown = { latitude: 32.7767, longitude: -96.7970 };
    
    const distance = calculateDistanceMiles(dfw, downtown);
    
    expect(distance).toBeGreaterThan(15);
    expect(distance).toBeLessThan(25);
  });

  it('should return 0 for same point', () => {
    const point = { latitude: 32.8998, longitude: -97.0403 };
    
    const distance = calculateDistanceMiles(point, point);
    
    expect(distance).toBe(0);
  });
});

describe('resolveZone', () => {
  const mockZones: Zone[] = [
    { id: 'z1', marketId: 'm1', zoneCode: 'ZONE_A', radiusMiles: '10', createdAt: new Date() },
    { id: 'z2', marketId: 'm1', zoneCode: 'ZONE_B', radiusMiles: '25', createdAt: new Date() },
    { id: 'z3', marketId: 'm1', zoneCode: 'ZONE_C', radiusMiles: '50', createdAt: new Date() },
    { id: 'z4', marketId: 'm2', zoneCode: 'ZONE_A', radiusMiles: '15', createdAt: new Date() },
  ];

  const marketCenter = { latitude: 32.8998, longitude: -97.0403 }; // DFW

  it('should resolve to smallest matching zone', () => {
    // Point 5 miles from center - should match ZONE_A (10 mile radius)
    const origin = { latitude: 32.8998, longitude: -97.1103 }; // ~5 miles west
    
    const result = resolveZone({
      origin,
      marketId: 'm1',
      zones: mockZones,
      marketCenterPoint: marketCenter,
    });
    
    expect(result.zone?.zoneCode).toBe('ZONE_A');
    expect(result.distanceFromCenter).toBeLessThan(10);
  });

  it('should resolve to larger zone when outside smaller zones', () => {
    // Point 20 miles from center - should match ZONE_B (25 mile radius)
    const origin = { latitude: 32.6098, longitude: -97.0403 }; // ~20 miles south
    
    const result = resolveZone({
      origin,
      marketId: 'm1',
      zones: mockZones,
      marketCenterPoint: marketCenter,
    });
    
    expect(result.zone?.zoneCode).toBe('ZONE_B');
  });

  it('should return null when outside all zones', () => {
    // Point 100 miles from center - outside all zones
    const origin = { latitude: 34.5, longitude: -97.0403 }; // ~100+ miles north
    
    const result = resolveZone({
      origin,
      marketId: 'm1',
      zones: mockZones,
      marketCenterPoint: marketCenter,
    });
    
    expect(result.zone).toBeNull();
    expect(result.distanceFromCenter).toBeGreaterThan(50);
  });

  it('should return null when no zones for market', () => {
    const result = resolveZone({
      origin: marketCenter,
      marketId: 'unknown-market',
      zones: mockZones,
      marketCenterPoint: marketCenter,
    });
    
    expect(result.zone).toBeNull();
  });

  it('should only consider zones for specified market', () => {
    const origin = marketCenter; // At center
    
    const result = resolveZone({
      origin,
      marketId: 'm2',
      zones: mockZones,
      marketCenterPoint: marketCenter,
    });
    
    expect(result.zone?.id).toBe('z4');
    expect(result.zone?.marketId).toBe('m2');
  });
});

// ============================================
// 3. MARKET RESOLUTION TESTS
// ============================================

describe('resolveMarket', () => {
  const mockMarkets: Market[] = [
    { id: 'm1', code: 'DFW', name: 'Dallas-Fort Worth', isActive: true, createdAt: new Date() },
    { id: 'm2', code: 'JACKSON', name: 'Jackson, MS', isActive: true, createdAt: new Date() },
    { id: 'm3', code: 'INACTIVE', name: 'Inactive Market', isActive: false, createdAt: new Date() },
  ];

  const mockZone: Zone = {
    id: 'z1',
    marketId: 'm1',
    zoneCode: 'ZONE_A',
    radiusMiles: '10',
    createdAt: new Date(),
  };

  it('should resolve via explicit market ID (highest priority)', () => {
    const result = resolveMarket({
      zone: mockZone, // Points to m1
      airportCode: 'JAN', // Points to JACKSON
      explicitMarketId: 'm2', // Explicit JACKSON
      markets: mockMarkets,
    });
    
    expect(result.market?.code).toBe('JACKSON');
    expect(result.resolvedVia).toBe('explicit');
  });

  it('should resolve via zone when no explicit ID', () => {
    const result = resolveMarket({
      zone: mockZone,
      airportCode: 'JAN',
      markets: mockMarkets,
    });
    
    expect(result.market?.code).toBe('DFW');
    expect(result.resolvedVia).toBe('zone');
  });

  it('should resolve via airport code when no zone', () => {
    const result = resolveMarket({
      airportCode: 'JAN',
      markets: mockMarkets,
    });
    
    expect(result.market?.code).toBe('JACKSON');
    expect(result.resolvedVia).toBe('airport_code');
  });

  it('should handle DAL airport mapping to DFW market', () => {
    const result = resolveMarket({
      airportCode: 'DAL',
      markets: mockMarkets,
    });
    
    expect(result.market?.code).toBe('DFW');
    expect(result.resolvedVia).toBe('airport_code');
  });

  it('should return null when no resolution possible', () => {
    const result = resolveMarket({
      airportCode: 'LAX', // Not in mappings
      markets: mockMarkets,
    });
    
    expect(result.market).toBeNull();
    expect(result.resolvedVia).toBe('none');
  });

  it('should not resolve to inactive markets', () => {
    const result = resolveMarket({
      explicitMarketId: 'm3', // Inactive market
      markets: mockMarkets,
    });
    
    expect(result.market).toBeNull();
    expect(result.resolvedVia).toBe('none');
  });

  it('should be case-insensitive for airport codes', () => {
    const result = resolveMarket({
      airportCode: 'dfw',
      markets: mockMarkets,
    });
    
    expect(result.market?.code).toBe('DFW');
  });
});

// ============================================
// 4. POLICY RESOLUTION TESTS
// ============================================

describe('resolvePolicy', () => {
  const now = new Date();
  const pastDate = new Date(now.getTime() - 86400000); // Yesterday
  const futureDate = new Date(now.getTime() + 86400000); // Tomorrow

  const mockPolicies: PolicyVersion[] = [
    // Exact match policy
    {
      id: 'p1',
      versionName: 'DFW SHIFT DRIVEAWAY',
      effectiveStart: pastDate,
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: 'DRIVEAWAY',
      baseRate: '25.00',
      createdAt: pastDate,
    },
    // execution_mode NULL policy
    {
      id: 'p2',
      versionName: 'DFW SHIFT Any Mode',
      effectiveStart: pastDate,
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: null,
      baseRate: '22.00',
      createdAt: pastDate,
    },
    // work_type NULL policy
    {
      id: 'p3',
      versionName: 'DFW Any Work Type',
      effectiveStart: pastDate,
      marketId: 'm1',
      workType: null,
      executionMode: null,
      baseRate: '20.00',
      createdAt: pastDate,
    },
    // Global fallback (market_id NULL)
    {
      id: 'p4',
      versionName: 'Global Default',
      effectiveStart: pastDate,
      marketId: null,
      workType: null,
      executionMode: null,
      baseRate: '18.00',
      createdAt: pastDate,
    },
    // Future policy (not yet effective)
    {
      id: 'p5',
      versionName: 'Future Policy',
      effectiveStart: futureDate,
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: 'DRIVEAWAY',
      baseRate: '30.00',
      createdAt: now,
    },
  ];

  it('should resolve exact match with highest precedence', () => {
    const result = resolvePolicy({
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: 'DRIVEAWAY',
      policies: mockPolicies,
    });
    
    expect(result.policy.id).toBe('p1');
    expect(result.matchLevel).toBe('exact');
  });

  it('should fall back to execution_mode NULL match', () => {
    const result = resolvePolicy({
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: 'CARRIER', // No exact match for this mode
      policies: mockPolicies,
    });
    
    expect(result.policy.id).toBe('p2');
    expect(result.matchLevel).toBe('execution_mode_null');
  });

  it('should fall back to work_type NULL match', () => {
    const result = resolvePolicy({
      marketId: 'm1',
      workType: 'ON_DEMAND', // No match for this work type
      executionMode: 'CARRIER',
      policies: mockPolicies,
    });
    
    expect(result.policy.id).toBe('p3');
    expect(result.matchLevel).toBe('work_type_null');
  });

  it('should fall back to global policy (market_id NULL)', () => {
    const result = resolvePolicy({
      marketId: 'm2', // No policies for this market
      workType: 'SHIFT',
      executionMode: 'DRIVEAWAY',
      policies: mockPolicies,
    });
    
    expect(result.policy.id).toBe('p4');
    expect(result.matchLevel).toBe('market_id_null');
  });

  it('should not match future policies', () => {
    // Remove all current policies except future one
    const futurePoliciesOnly = mockPolicies.filter(p => p.id === 'p5');
    
    expect(() => resolvePolicy({
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: 'DRIVEAWAY',
      policies: futurePoliciesOnly,
    })).toThrow(NoPolicyFoundError);
  });

  it('should throw NoPolicyFoundError when no match', () => {
    const emptyPolicies: PolicyVersion[] = [];
    
    expect(() => resolvePolicy({
      marketId: 'm1',
      workType: 'SHIFT',
      executionMode: 'DRIVEAWAY',
      policies: emptyPolicies,
    })).toThrow(NoPolicyFoundError);
  });

  it('should include context in NoPolicyFoundError', () => {
    try {
      resolvePolicy({
        marketId: 'm1',
        workType: 'SHIFT',
        executionMode: 'DRIVEAWAY',
        policies: [],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      if (error instanceof NoPolicyFoundError) {
        expect(error.marketId).toBe('m1');
        expect(error.workType).toBe('SHIFT');
        expect(error.executionMode).toBe('DRIVEAWAY');
        expect(error.message).toContain('m1');
        expect(error.message).toContain('SHIFT');
        expect(error.message).toContain('DRIVEAWAY');
      } else {
        throw error;
      }
    }
  });
});

describe('DEFAULT_AIRPORT_MARKET_MAPPINGS', () => {
  it('should have DFW and Dallas Love Field mapped to DFW', () => {
    expect(DEFAULT_AIRPORT_MARKET_MAPPINGS).toContainEqual({ airportCode: 'DFW', marketCode: 'DFW' });
    expect(DEFAULT_AIRPORT_MARKET_MAPPINGS).toContainEqual({ airportCode: 'DAL', marketCode: 'DFW' });
  });

  it('should have Jackson mapped', () => {
    expect(DEFAULT_AIRPORT_MARKET_MAPPINGS).toContainEqual({ airportCode: 'JAN', marketCode: 'JACKSON' });
  });
});

// ============================================
// 5. PAY CALCULATION ENGINE TESTS (INCREMENT 3)
// ============================================

describe('dollarsToCents', () => {
  it('should convert whole dollars to cents', () => {
    expect(dollarsToCents('25.00')).toBe(2500);
    expect(dollarsToCents('100.00')).toBe(10000);
  });

  it('should convert dollars with cents', () => {
    expect(dollarsToCents('25.50')).toBe(2550);
    expect(dollarsToCents('18.75')).toBe(1875);
  });

  it('should handle decimal precision', () => {
    expect(dollarsToCents('25.999')).toBe(2600); // Rounds
    expect(dollarsToCents('25.001')).toBe(2500); // Rounds
  });

  it('should throw for invalid input', () => {
    expect(() => dollarsToCents('invalid')).toThrow('Invalid dollar string');
    expect(() => dollarsToCents('')).toThrow('Invalid dollar string');
  });
});

describe('calculateBasePayCents', () => {
  it('should calculate pay for 60 minutes at $25/hr', () => {
    // round((60 / 60) * 25 * 100) = 2500 cents
    expect(calculateBasePayCents(60, 25)).toBe(2500);
  });

  it('should calculate pay for 30 minutes at $25/hr', () => {
    // round((30 / 60) * 25 * 100) = 1250 cents
    expect(calculateBasePayCents(30, 25)).toBe(1250);
  });

  it('should calculate pay for 90 minutes at $20/hr', () => {
    // round((90 / 60) * 20 * 100) = 3000 cents
    expect(calculateBasePayCents(90, 20)).toBe(3000);
  });

  it('should round to nearest cent', () => {
    // round((45 / 60) * 25 * 100) = 1875 cents (exact)
    expect(calculateBasePayCents(45, 25)).toBe(1875);
    // round((47 / 60) * 25 * 100) = 1958.333... → 1958 cents
    expect(calculateBasePayCents(47, 25)).toBe(1958);
  });

  it('should handle zero minutes', () => {
    expect(calculateBasePayCents(0, 25)).toBe(0);
  });

  it('should throw for negative minutes', () => {
    expect(() => calculateBasePayCents(-10, 25)).toThrow('paidMinutes cannot be negative');
  });

  it('should throw for negative rate', () => {
    expect(() => calculateBasePayCents(60, -1)).toThrow('baseRateDollars cannot be negative');
  });
});

describe('calculateEffectiveMultiplier', () => {
  it('should return 1.0 with no multipliers', () => {
    expect(calculateEffectiveMultiplier()).toBe(1.0);
    expect(calculateEffectiveMultiplier({})).toBe(1.0);
  });

  it('should multiply volume and safety multipliers', () => {
    const result = calculateEffectiveMultiplier({
      weeklyVolumeMultiplier: 1.05,
      thirtyDaySafetyMultiplier: 1.05,
    });
    // 1.05 * 1.05 = 1.1025
    expect(result).toBeCloseTo(1.1025);
  });

  it('should clamp at maximum 1.15', () => {
    const result = calculateEffectiveMultiplier({
      weeklyVolumeMultiplier: 1.10,
      thirtyDaySafetyMultiplier: 1.10,
    });
    // 1.10 * 1.10 = 1.21 → clamped to 1.15
    expect(result).toBe(MULTIPLIER_CLAMP.MAX);
  });

  it('should clamp at minimum 0.85', () => {
    const result = calculateEffectiveMultiplier({
      weeklyVolumeMultiplier: 0.80,
      thirtyDaySafetyMultiplier: 0.90,
    });
    // 0.80 * 0.90 = 0.72 → clamped to 0.85
    expect(result).toBe(MULTIPLIER_CLAMP.MIN);
  });

  it('should handle single multiplier', () => {
    expect(calculateEffectiveMultiplier({ weeklyVolumeMultiplier: 1.10 })).toBe(1.10);
    expect(calculateEffectiveMultiplier({ thirtyDaySafetyMultiplier: 0.95 })).toBe(0.95);
  });
});

describe('calculateAdjustedPay', () => {
  it('should calculate adjusted pay with formula: round(base * volume * safety)', () => {
    // base_pay_cents = 2500, volume = 1.05, safety = 1.05
    // combined = 1.1025, adjusted = round(2500 * 1.1025) = 2756
    const result = calculateAdjustedPay(2500, {
      weeklyVolumeMultiplier: 1.05,
      thirtyDaySafetyMultiplier: 1.05,
    });
    
    expect(result.volumeMultiplier).toBe(1.05);
    expect(result.safetyMultiplier).toBe(1.05);
    expect(result.effectiveMultiplier).toBeCloseTo(1.1025);
    expect(result.adjustedPayCents).toBe(2756);
  });

  it('should return base pay when no multipliers', () => {
    const result = calculateAdjustedPay(2500);
    
    expect(result.volumeMultiplier).toBe(1.0);
    expect(result.safetyMultiplier).toBe(1.0);
    expect(result.effectiveMultiplier).toBe(1.0);
    expect(result.adjustedPayCents).toBe(2500);
  });

  it('should clamp combined multiplier at 1.15 max', () => {
    // 1.10 * 1.10 = 1.21 → clamped to 1.15
    const result = calculateAdjustedPay(2000, {
      weeklyVolumeMultiplier: 1.10,
      thirtyDaySafetyMultiplier: 1.10,
    });
    
    expect(result.effectiveMultiplier).toBe(1.15);
    expect(result.adjustedPayCents).toBe(2300); // 2000 * 1.15
  });

  it('should clamp combined multiplier at 0.85 min', () => {
    // 0.80 * 0.90 = 0.72 → clamped to 0.85
    const result = calculateAdjustedPay(2000, {
      weeklyVolumeMultiplier: 0.80,
      thirtyDaySafetyMultiplier: 0.90,
    });
    
    expect(result.effectiveMultiplier).toBe(0.85);
    expect(result.adjustedPayCents).toBe(1700); // 2000 * 0.85
  });

  it('should handle single multiplier with default 1.0 for other', () => {
    const volumeOnly = calculateAdjustedPay(1000, { weeklyVolumeMultiplier: 1.10 });
    expect(volumeOnly.safetyMultiplier).toBe(1.0);
    expect(volumeOnly.adjustedPayCents).toBe(1100);
    
    const safetyOnly = calculateAdjustedPay(1000, { thirtyDaySafetyMultiplier: 0.95 });
    expect(safetyOnly.volumeMultiplier).toBe(1.0);
    expect(safetyOnly.adjustedPayCents).toBe(950);
  });
});

describe('applyGuardrails', () => {
  it('should return original pay when no guardrails', () => {
    const result = applyGuardrails(2500, 60, 'SHIFT');
    expect(result.finalPayCents).toBe(2500);
    expect(result.floorApplied).toBe(false);
    expect(result.capApplied).toBe(false);
  });

  it('should apply minimum hourly floor when pay is too low', () => {
    // 60 minutes at minimum $20/hr = 2000 cents floor
    const result = applyGuardrails(1800, 60, 'SHIFT', {
      minimumHourlyCents: 2000,
    });
    expect(result.finalPayCents).toBe(2000);
    expect(result.floorApplied).toBe(true);
    expect(result.capApplied).toBe(false);
  });

  it('should not apply floor when pay exceeds minimum', () => {
    const result = applyGuardrails(2500, 60, 'SHIFT', {
      minimumHourlyCents: 2000,
    });
    expect(result.finalPayCents).toBe(2500);
    expect(result.floorApplied).toBe(false);
  });

  it('should apply on-demand max cap for ON_DEMAND work', () => {
    const result = applyGuardrails(10000, 120, 'ON_DEMAND', {
      onDemandMaxCapCents: 7500,
    });
    expect(result.finalPayCents).toBe(7500);
    expect(result.capApplied).toBe(true);
  });

  it('should NOT apply on-demand cap for SHIFT work', () => {
    const result = applyGuardrails(10000, 120, 'SHIFT', {
      onDemandMaxCapCents: 7500,
    });
    expect(result.finalPayCents).toBe(10000);
    expect(result.capApplied).toBe(false);
  });

  it('should apply both floor and cap when appropriate', () => {
    // Pay is below floor, but after floor it exceeds cap
    // Floor: 60 min at $15/hr = 1500 cents
    // But cap is 1200 cents
    // Floor applied first, then cap
    const result = applyGuardrails(1000, 60, 'ON_DEMAND', {
      minimumHourlyCents: 1500,
      onDemandMaxCapCents: 1200,
    });
    // Floor raises to 1500, then cap lowers to 1200
    expect(result.finalPayCents).toBe(1200);
    expect(result.floorApplied).toBe(true);
    expect(result.capApplied).toBe(true);
  });
});

describe('calculatePayLine', () => {
  it('should calculate SHIFT pay correctly', () => {
    const result = calculatePayLine('line-1', {
      workType: 'SHIFT',
      paidMinutes: 60,
      baseRateDollars: '25.00',
    });

    expect(result.id).toBe('line-1');
    expect(result.workType).toBe('SHIFT');
    expect(result.paidMinutes).toBe(60);
    expect(result.baseRateCents).toBe(2500);
    expect(result.basePayCents).toBe(2500); // 60/60 * 2500
    expect(result.effectiveMultiplier).toBe(1.0);
    expect(result.adjustedPayCents).toBe(2500);
    expect(result.finalPayCents).toBe(2500);
    expect(result.floorApplied).toBe(false);
    expect(result.capApplied).toBe(false);
  });

  it('should calculate ON_DEMAND pay correctly', () => {
    const result = calculatePayLine('line-2', {
      workType: 'ON_DEMAND',
      paidMinutes: 88, // estimated_minutes_total from move
      baseRateDollars: '20.00',
    });

    expect(result.workType).toBe('ON_DEMAND');
    expect(result.baseRateCents).toBe(2000);
    // 88/60 * 2000 = 2933.33 → 2933
    expect(result.basePayCents).toBe(2933);
    expect(result.finalPayCents).toBe(2933);
  });

  it('should apply multipliers correctly', () => {
    const result = calculatePayLine('line-3', {
      workType: 'SHIFT',
      paidMinutes: 60,
      baseRateDollars: '25.00',
      multipliers: {
        weeklyVolumeMultiplier: 1.05,
        thirtyDaySafetyMultiplier: 1.05,
      },
    });

    expect(result.basePayCents).toBe(2500);
    expect(result.effectiveMultiplier).toBeCloseTo(1.1025);
    // 2500 * 1.1025 = 2756.25 → 2756
    expect(result.adjustedPayCents).toBe(2756);
    expect(result.finalPayCents).toBe(2756);
  });

  it('should apply guardrails with multipliers', () => {
    const result = calculatePayLine('line-4', {
      workType: 'ON_DEMAND',
      paidMinutes: 120,
      baseRateDollars: '30.00',
      multipliers: {
        weeklyVolumeMultiplier: 1.10,
        thirtyDaySafetyMultiplier: 1.05,
      },
      guardrails: {
        onDemandMaxCapCents: 5000,
      },
    });

    // Base: 120/60 * 3000 = 6000
    // Multiplier: 1.10 * 1.05 = 1.155 → clamped to 1.15
    // Adjusted: 6000 * 1.15 = 6900
    // Cap: 5000
    expect(result.basePayCents).toBe(6000);
    expect(result.effectiveMultiplier).toBe(1.15);
    expect(result.adjustedPayCents).toBe(6900);
    expect(result.finalPayCents).toBe(5000);
    expect(result.capApplied).toBe(true);
  });

  it('should apply floor when adjusted pay is too low', () => {
    const result = calculatePayLine('line-5', {
      workType: 'SHIFT',
      paidMinutes: 60,
      baseRateDollars: '15.00',
      multipliers: {
        weeklyVolumeMultiplier: 0.90,
        thirtyDaySafetyMultiplier: 0.95,
      },
      guardrails: {
        minimumHourlyCents: 1600, // $16/hr minimum
      },
    });

    // Base: 60/60 * 1500 = 1500
    // Multiplier: 0.90 * 0.95 = 0.855 → clamped to 0.855
    // Adjusted: 1500 * 0.855 = 1282.5 → 1283
    // Floor: 60/60 * 1600 = 1600
    expect(result.basePayCents).toBe(1500);
    expect(result.effectiveMultiplier).toBeCloseTo(0.855);
    expect(result.adjustedPayCents).toBe(1283);
    expect(result.finalPayCents).toBe(1600);
    expect(result.floorApplied).toBe(true);
  });
});

describe('aggregatePayPeriod', () => {
  it('should aggregate empty pay lines', () => {
    const result = aggregatePayPeriod('period-1', []);

    expect(result.payPeriodId).toBe('period-1');
    expect(result.lineCount).toBe(0);
    expect(result.totalMinutes).toBe(0);
    expect(result.totalBasePayCents).toBe(0);
    expect(result.totalAdjustedPayCents).toBe(0);
    expect(result.totalFinalPayCents).toBe(0);
    expect(result.floorAppliedCount).toBe(0);
    expect(result.capAppliedCount).toBe(0);
  });

  it('should aggregate multiple pay lines', () => {
    const payLines = [
      calculatePayLine('l1', {
        workType: 'SHIFT',
        paidMinutes: 60,
        baseRateDollars: '25.00',
      }),
      calculatePayLine('l2', {
        workType: 'ON_DEMAND',
        paidMinutes: 45,
        baseRateDollars: '20.00',
      }),
      calculatePayLine('l3', {
        workType: 'SHIFT',
        paidMinutes: 120,
        baseRateDollars: '22.00',
      }),
    ];

    const result = aggregatePayPeriod('period-2', payLines);

    expect(result.lineCount).toBe(3);
    expect(result.totalMinutes).toBe(60 + 45 + 120); // 225
    // l1: 2500, l2: 1500, l3: 4400
    expect(result.totalBasePayCents).toBe(2500 + 1500 + 4400);
    expect(result.totalFinalPayCents).toBe(2500 + 1500 + 4400);
  });

  it('should count floor and cap applications', () => {
    const payLines = [
      calculatePayLine('l1', {
        workType: 'ON_DEMAND',
        paidMinutes: 120,
        baseRateDollars: '30.00',
        guardrails: { onDemandMaxCapCents: 5000 },
      }),
      calculatePayLine('l2', {
        workType: 'SHIFT',
        paidMinutes: 60,
        baseRateDollars: '12.00',
        guardrails: { minimumHourlyCents: 1500 },
      }),
      calculatePayLine('l3', {
        workType: 'SHIFT',
        paidMinutes: 60,
        baseRateDollars: '25.00',
      }),
    ];

    const result = aggregatePayPeriod('period-3', payLines);

    expect(result.lineCount).toBe(3);
    expect(result.floorAppliedCount).toBe(1); // l2
    expect(result.capAppliedCount).toBe(1); // l1
  });

  it('should correctly sum adjusted pay with multipliers', () => {
    const payLines = [
      calculatePayLine('l1', {
        workType: 'SHIFT',
        paidMinutes: 60,
        baseRateDollars: '20.00',
        multipliers: { weeklyVolumeMultiplier: 1.10 },
      }),
      calculatePayLine('l2', {
        workType: 'SHIFT',
        paidMinutes: 60,
        baseRateDollars: '20.00',
        multipliers: { thirtyDaySafetyMultiplier: 0.90 },
      }),
    ];

    const result = aggregatePayPeriod('period-4', payLines);

    // l1: base 2000, adjusted 2200
    // l2: base 2000, adjusted 1800
    expect(result.totalBasePayCents).toBe(4000);
    expect(result.totalAdjustedPayCents).toBe(4000); // 2200 + 1800
    expect(result.totalFinalPayCents).toBe(4000);
  });
});
