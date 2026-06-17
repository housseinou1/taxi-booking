import { calculateFare } from './fareCalculator';

describe('calculateFare', () => {
  it('calculates regular fare correctly', () => {
    // base=200, perKm=20, distance=5 => 200 + 5*20 = 300
    expect(calculateFare('regular', 5)).toBe(300);
  });

  it('calculates xl fare correctly', () => {
    // base=300, perKm=30, distance=10 => 300 + 10*30 = 600
    expect(calculateFare('xl', 10)).toBe(600);
  });

  it('calculates comfort fare correctly', () => {
    // base=350, perKm=35, distance=3 => 350 + 3*35 = 455
    expect(calculateFare('comfort', 3)).toBe(455);
  });

  it('calculates share fare correctly', () => {
    // base=150, perKm=15, distance=8 => 150 + 8*15 = 270
    expect(calculateFare('share', 8)).toBe(270);
  });

  it('handles zero distance', () => {
    // base=200, perKm=20, distance=0 => 200
    expect(calculateFare('regular', 0)).toBe(200);
  });

  it('handles fractional distances', () => {
    // base=200, perKm=20, distance=2.5 => 200 + 2.5*20 = 250
    expect(calculateFare('regular', 2.5)).toBe(250);
  });

  it('falls back to regular pricing for unknown ride type', () => {
    expect(calculateFare('unknown', 5)).toBe(300);
  });

  it('handles null distance as 0', () => {
    expect(calculateFare('regular', null)).toBe(200);
  });
});
