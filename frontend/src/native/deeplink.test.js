/**
 * Focused tests for native deep-link parsing and listener initialization.
 *
 * Context: the legacy https://yala.mr/* universal-link handling was removed
 * (yala.mr is a decommissioned domain with no Digital Asset Links, and no app
 * ships an https App Link intent-filter). These tests lock in the surviving
 * behavior: the yala-rider:// and yala-driver:// custom schemes still parse,
 * unsupported URLs (including the removed yala.mr links) are rejected safely,
 * and the appUrlOpen listener wires up only on native platforms.
 */

// Mock the Capacitor App plugin that deeplink.js require()s at module load.
// The factory must not reference outer variables (Jest hoists jest.mock above
// imports), so define the mock inline and read it back via require() below.
jest.mock(
  '@capacitor/app',
  () => ({ App: { addListener: jest.fn() } }),
  { virtual: true },
);

// Mock platform detection so we can toggle native vs browser mode per test.
jest.mock('./platform', () => ({
  isNative: jest.fn(),
}));

import { parseDeepLink, initDeepLinkListener } from './deeplink';
import { isNative } from './platform';
// eslint-disable-next-line import/first
import { App } from '@capacitor/app';

const mockAddListener = App.addListener;

describe('parseDeepLink — custom scheme (supported)', () => {
  test('yala-rider:// with a path maps to the matching internal route', () => {
    expect(parseDeepLink('yala-rider://rider-dashboard')).toBe('/rider-dashboard');
    expect(parseDeepLink('yala-rider://rider-history')).toBe('/rider-history');
  });

  test('yala-rider:// strips a leading slash in the path', () => {
    expect(parseDeepLink('yala-rider:///rider-dashboard')).toBe('/rider-dashboard');
  });

  test('yala-rider:// with an empty path returns root', () => {
    expect(parseDeepLink('yala-rider://')).toBe('/');
  });

  test('yala-driver:// is supported and maps to the matching internal route', () => {
    expect(parseDeepLink('yala-driver://driver')).toBe('/driver');
    expect(parseDeepLink('yala-driver://driver/earnings')).toBe('/driver/earnings');
  });

  test('always returns a route string starting with "/" for supported schemes', () => {
    for (const url of [
      'yala-rider://rider-dashboard',
      'yala-rider://',
      'yala-driver://driver',
      'yala-driver://driver/documents',
    ]) {
      const route = parseDeepLink(url);
      expect(typeof route).toBe('string');
      expect(route.startsWith('/')).toBe(true);
    }
  });
});

describe('parseDeepLink — unsupported URLs are rejected safely', () => {
  test('returns null for null/undefined/empty input', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink('')).toBeNull();
  });

  test('returns null for the removed legacy yala.mr universal links', () => {
    expect(parseDeepLink('https://yala.mr/rider/dashboard')).toBeNull();
    expect(parseDeepLink('https://yala.mr/rider/')).toBeNull();
    expect(parseDeepLink('https://yala.mr/rider')).toBeNull();
    expect(parseDeepLink('https://yala.mr/driver/earnings')).toBeNull();
    expect(parseDeepLink('https://yala.mr/driver')).toBeNull();
  });

  test('returns null for unrelated schemes and the production web domain', () => {
    expect(parseDeepLink('https://yalataxi.live/rider/dashboard')).toBeNull();
    expect(parseDeepLink('https://example.com/rider')).toBeNull();
    expect(parseDeepLink('yala-admin://admin')).toBeNull();
    expect(parseDeepLink('mailto:support@yalataxi.live')).toBeNull();
    expect(parseDeepLink('javascript:alert(1)')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
  });
});

describe('initDeepLinkListener', () => {
  beforeEach(() => {
    mockAddListener.mockClear();
    isNative.mockReset();
  });

  test('registers an appUrlOpen listener when running natively', () => {
    isNative.mockReturnValue(true);

    initDeepLinkListener(jest.fn());

    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(mockAddListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
  });

  test('does not register a listener in browser mode', () => {
    isNative.mockReturnValue(false);

    initDeepLinkListener(jest.fn());

    expect(mockAddListener).not.toHaveBeenCalled();
  });

  test('navigates with the parsed route for a supported deep link', () => {
    isNative.mockReturnValue(true);
    const navigate = jest.fn();

    initDeepLinkListener(navigate);
    const handler = mockAddListener.mock.calls[0][1];
    handler({ url: 'yala-rider://rider-dashboard' });

    expect(navigate).toHaveBeenCalledWith('/rider-dashboard');
  });

  test('does not navigate for an unsupported (legacy yala.mr) deep link', () => {
    isNative.mockReturnValue(true);
    const navigate = jest.fn();

    initDeepLinkListener(navigate);
    const handler = mockAddListener.mock.calls[0][1];
    handler({ url: 'https://yala.mr/rider/dashboard' });

    expect(navigate).not.toHaveBeenCalled();
  });
});
