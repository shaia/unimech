import { describe, expect, it } from 'vitest';
import { decimalOf, prefixed, sci } from '~/sims/core/format';

describe('sci', () => {
  it.each([
    [0, '0'],
    [0.0123, '0.0123'],
    [3.6, '3.6'],
    [72000, '7.2·10⁴'],
    [5000, '5000'],
    [1234, '1230'],
    [9999, '1·10⁴'],
    [999.9, '1000'],
    [-2500, '-2500'],
    [1.6e-19, '1.6·10⁻¹⁹'],
  ])('%d → %s', (x, s) => {
    expect(sci(x)).toBe(s);
  });
});

describe('decimalOf writes m·10ᵉ in full, digit-exact', () => {
  it('small numbers get leading zeros', () => {
    expect(decimalOf(1.5, -5)).toBe('0.000015');
    expect(decimalOf(2, -6)).toBe('0.000002');
    expect(decimalOf(1.5, -1)).toBe('0.15');
  });
  it('large numbers get trailing zeros and thousands commas', () => {
    expect(decimalOf(3, 9)).toBe('3,000,000,000');
    expect(decimalOf(6.4, 6)).toBe('6,400,000');
    expect(decimalOf(2.5, 2)).toBe('250');
  });
  it('a point inside the digits stays a decimal', () => {
    expect(decimalOf(1.5, 0)).toBe('1.5');
    expect(decimalOf(1, 0)).toBe('1');
  });
});

describe('prefixed picks the prefix that leaves 1 to 999', () => {
  it('converts across the prefix ladder', () => {
    expect(prefixed(1.5, -5, 'C')).toBe('15 μC');
    expect(prefixed(2, -6, 'C')).toBe('2 μC');
    expect(prefixed(1.5, -1, 'm')).toBe('150 mm');
    expect(prefixed(4, -10, 'm')).toBe('400 pm');
    expect(prefixed(6.4, 6, 'm')).toBe('6.4 Mm');
    expect(prefixed(1, -12, 'F')).toBe('1 pF');
  });
});
