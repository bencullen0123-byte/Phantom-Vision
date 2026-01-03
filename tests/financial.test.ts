import { describe, it, expect } from 'vitest';
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
