import { isProfileComplete } from './profileCheck';

describe('isProfileComplete', () => {
  it('returns true when both profile_picture and phone_number are present', () => {
    expect(isProfileComplete({
      profile_picture: 'https://example.com/photo.jpg',
      phone_number: '+22245000001',
    })).toBe(true);
  });

  it('returns false when profile_picture is null', () => {
    expect(isProfileComplete({
      profile_picture: null,
      phone_number: '+22245000001',
    })).toBe(false);
  });

  it('returns false when phone_number is null', () => {
    expect(isProfileComplete({
      profile_picture: 'https://example.com/photo.jpg',
      phone_number: null,
    })).toBe(false);
  });

  it('returns false when profile_picture is empty string', () => {
    expect(isProfileComplete({
      profile_picture: '',
      phone_number: '+22245000001',
    })).toBe(false);
  });

  it('returns false when phone_number is empty string', () => {
    expect(isProfileComplete({
      profile_picture: 'https://example.com/photo.jpg',
      phone_number: '',
    })).toBe(false);
  });

  it('returns false when both are missing', () => {
    expect(isProfileComplete({
      profile_picture: null,
      phone_number: null,
    })).toBe(false);
  });

  it('returns false when profile is null', () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it('returns false when profile is undefined', () => {
    expect(isProfileComplete(undefined)).toBe(false);
  });
});
