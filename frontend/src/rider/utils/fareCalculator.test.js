import { calculateFare } from './fareCalculator';

describe('calculateFare', () => {
  it('calculates regular fare correctly', () => {
    // base=175, perKm=20, distance=5 => 175 + 5*20 = 275
    expect(calculateFare('regular', 5)).toBe(275);
  });

  it('calculates xl fare correctly', () => {
    // base=225, perKm=25, distance=10 => 225 + 10*25 = 475
    expect(calculateFare('xl', 10)).toBe(475);
  });

  it('calculates comfort fare correctly', () => {
    // base=275, perKm=30, distance=3 => 275 + 3*30 = 365
    expect(calculateFare('comfort', 3)).toBe(365);
  });

  it('calculates share fare correctly', () => {
    // base=150, perKm=15, distance=8 => 150 + 8*15 = 270
    expect(calculateFare('share', 8)).toBe(270);
  });

  it('handles zero distance', () => {
    // base=175, perKm=20, distance=0 => 175
    expect(calculateFare('regular', 0)).toBe(175);
  });

  it('handles fractional distances', () => {
    // base=175, perKm=20, distance=2.5 => 175 + 2.5*20 = 225
    expect(calculateFare('regular', 2.5)).toBe(225);
  });

  it('falls back to regular pricing for unknown ride type', () => {
    expect(calculateFare('unknown', 5)).toBe(275);
  });

  it('handles null distance as 0', () => {
    expect(calculateFare('regular', null)).toBe(175);
  });
});
