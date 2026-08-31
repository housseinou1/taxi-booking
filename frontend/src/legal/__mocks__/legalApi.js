export const fetchLegalStatus = jest.fn(() =>
  Promise.resolve({
    ride: { compliance_current: true, requires_resign: false },
  })
);

export const acceptRideLegal = jest.fn(() => Promise.resolve({}));

export const fetchLegalVersions = jest.fn(() => Promise.resolve({}));
