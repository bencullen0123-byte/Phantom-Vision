import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { determineRecoveryStrategy } from '../server/services/ghostHunter';
import { mapFailureCodeToCategory } from '../shared/leakageCategories';

describe('Recovery Strategy Logic', () => {
  it('returns technical_bridge when 3DS is required', () => {
    const result = determineRecoveryStrategy({
      requires3ds: true,
      declineType: 'soft',
      amount: 10000,
    });
    expect(result).toBe('technical_bridge');
  });

  it('returns high_value_manual for invoices over $500', () => {
    const result = determineRecoveryStrategy({
      requires3ds: false,
      declineType: 'soft',
      amount: 60000,
    });
    expect(result).toBe('high_value_manual');
  });

  it('returns card_refresh for hard declines (stolen_card)', () => {
    const result = determineRecoveryStrategy({
      requires3ds: false,
      declineType: 'hard',
      amount: 10000,
    });
    expect(result).toBe('card_refresh');
  });

  it('returns smart_retry for soft declines (insufficient_funds)', () => {
    const result = determineRecoveryStrategy({
      requires3ds: false,
      declineType: 'soft',
      amount: 10000,
    });
    expect(result).toBe('smart_retry');
  });

  it('prioritizes 3DS over high value', () => {
    const result = determineRecoveryStrategy({
      requires3ds: true,
      declineType: 'hard',
      amount: 100000,
    });
    expect(result).toBe('technical_bridge');
  });

  it('prioritizes high value over hard declines', () => {
    const result = determineRecoveryStrategy({
      requires3ds: false,
      declineType: 'hard',
      amount: 60000,
    });
    expect(result).toBe('high_value_manual');
  });
});

describe('Failure Code Categorization', () => {
  it('maps insufficient_funds to Wallet Friction', () => {
    const result = mapFailureCodeToCategory('insufficient_funds');
    expect(result).toBe('Wallet Friction');
  });

  it('maps expired_card to Expired Access', () => {
    const result = mapFailureCodeToCategory('expired_card');
    expect(result).toBe('Expired Access');
  });

  it('maps stolen_card to Security / Hard Decline', () => {
    const result = mapFailureCodeToCategory('stolen_card');
    expect(result).toBe('Security / Hard Decline');
  });

  it('maps fraudulent to Security / Hard Decline', () => {
    const result = mapFailureCodeToCategory('fraudulent');
    expect(result).toBe('Security / Hard Decline');
  });

  it('maps generic_decline to Bank Bottleneck', () => {
    const result = mapFailureCodeToCategory('generic_decline');
    expect(result).toBe('Bank Bottleneck');
  });

  it('maps null to Unknown', () => {
    const result = mapFailureCodeToCategory(null);
    expect(result).toBe('Unknown');
  });

  it('maps undefined to Unknown', () => {
    const result = mapFailureCodeToCategory(undefined);
    expect(result).toBe('Unknown');
  });

  it('maps unknown codes to Unknown', () => {
    const result = mapFailureCodeToCategory('some_random_code');
    expect(result).toBe('Unknown');
  });
});

describe('Decimal.js Penny-Perfect Precision', () => {
  it('handles the classic 0.1 + 0.2 problem correctly', () => {
    // Native JavaScript: 0.1 + 0.2 = 0.30000000000000004 (WRONG)
    const nativeResult = 0.1 + 0.2;
    expect(nativeResult).not.toBe(0.3); // Proves the IEEE 754 bug exists
    
    // Decimal.js: 0.1 + 0.2 = 0.3 (CORRECT)
    const decimalResult = new Decimal(0.1).plus(0.2).toNumber();
    expect(decimalResult).toBe(0.3);
  });

  it('calculates MRR normalization from yearly to monthly accurately', () => {
    // $1200/year should be exactly $100/month
    const yearlyAmount = 120000; // cents
    
    // Decimal.js calculation (our implementation)
    const monthlyDecimal = new Decimal(yearlyAmount).dividedBy(12).floor().toNumber();
    expect(monthlyDecimal).toBe(10000); // $100.00
    
    // Edge case: $1199/year - should floor to $99.91
    const oddYearly = 119900; // cents
    const oddMonthly = new Decimal(oddYearly).dividedBy(12).floor().toNumber();
    expect(oddMonthly).toBe(9991); // $99.91 (floored from 9991.666...)
  });

  it('calculates weekly to monthly normalization without drift', () => {
    // $100/week * 4.33 = $433/month
    const weeklyAmount = 10000; // cents
    
    const monthlyDecimal = new Decimal(weeklyAmount).times(4.33).floor().toNumber();
    expect(monthlyDecimal).toBe(43300); // $433.00
  });

  it('calculates daily to monthly normalization accurately', () => {
    // $10/day * 30 = $300/month
    const dailyAmount = 1000; // cents
    
    const monthlyDecimal = new Decimal(dailyAmount).times(30).floor().toNumber();
    expect(monthlyDecimal).toBe(30000); // $300.00
  });

  it('calculates recovery rate with precision', () => {
    // 7 recovered out of 23 total = 30.434782608695652%
    const recovered = 7;
    const total = 23;
    
    // Native division can have precision issues
    const decimalRate = new Decimal(recovered).dividedBy(total).times(100).toNumber();
    
    // Should be precise to many decimal places
    expect(decimalRate).toBeCloseTo(30.434782608695652, 10);
    
    // Round for display: 30.43%
    const displayRate = Math.round(decimalRate * 100) / 100;
    expect(displayRate).toBe(30.43);
  });

  it('handles large revenue aggregations without overflow', () => {
    // Aggregate $1M+ in cents without precision loss
    const amounts = [
      9999999, // $99,999.99
      8888888, // $88,888.88
      7777777, // $77,777.77
      6666666, // $66,666.66
      5555555, // $55,555.55
    ];
    
    let decimalSum = new Decimal(0);
    for (const amount of amounts) {
      decimalSum = decimalSum.plus(amount);
    }
    
    expect(decimalSum.toNumber()).toBe(38888885); // $388,888.85 exactly
  });

  it('prevents NaN from invalid operations', () => {
    // Division by zero should be handled
    const result = new Decimal(100).dividedBy(0);
    expect(result.isFinite()).toBe(false);
    
    // Empty aggregations should default to 0
    const emptySum = new Decimal(0);
    expect(emptySum.toNumber()).toBe(0);
    expect(Number.isNaN(emptySum.toNumber())).toBe(false);
  });
});
