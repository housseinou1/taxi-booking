import {
  getRecentDestinations,
  rememberRecentDestination,
} from './recentDestinationsStorage';

describe('recentDestinationsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and deduplicates recent destinations', () => {
    const first = {
      label: 'Ksar',
      position: [18.1, -15.96],
      city: 'Nouakchott',
    };
    const second = {
      label: 'Airport',
      position: [18.2, -15.95],
      city: 'Nouakchott',
    };

    rememberRecentDestination(first);
    rememberRecentDestination(second);
    rememberRecentDestination(first);

    const recent = getRecentDestinations();
    expect(recent).toHaveLength(2);
    expect(recent[0].label).toBe('Ksar');
    expect(recent[1].label).toBe('Airport');
  });
});
