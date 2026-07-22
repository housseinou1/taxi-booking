import { mergeAvailableRidesFromServer } from "./mergeAvailableRides";

describe("mergeAvailableRidesFromServer", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  it("keeps a pending WS offer when the poll response is still empty", () => {
    const localOffer = {
      id: 42,
      ride_id: 42,
      pickup: "Sebkha",
      destination: "Tevragh Zeina",
      offerReceivedAt: 999_000,
      countdown: 30,
    };

    const merged = mergeAvailableRidesFromServer([], [localOffer], null);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(42);
    expect(merged[0].pickup).toBe("Sebkha");
  });

  it("prefers server data once the offer appears in /rides/available/", () => {
    const localOffer = {
      id: 42,
      ride_id: 42,
      pickup: "Sebkha",
      destination: "Old destination",
      offerReceivedAt: 999_000,
      countdown: 30,
    };
    const serverOffer = {
      id: 42,
      ride_id: 42,
      pickup: "Sebkha",
      destination: "Airport",
      fare: 500,
    };

    const merged = mergeAvailableRidesFromServer([serverOffer], [localOffer], null);

    expect(merged).toHaveLength(1);
    expect(merged[0].destination).toBe("Airport");
    expect(merged[0].offerReceivedAt).toBe(999_000);
  });

  it("drops expired local-only offers", () => {
    const localOffer = {
      id: 99,
      ride_id: 99,
      pickup: "Late",
      offerReceivedAt: 900_000,
      countdown: 30,
    };

    const merged = mergeAvailableRidesFromServer([], [localOffer], null);

    expect(merged).toHaveLength(0);
  });
});
