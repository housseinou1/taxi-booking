import {
  consumeRebookDestination,
  locationFromHistoryTrip,
  storeRebookDestination,
} from "./rebookStorage";

describe("rebookStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and consumes a rebook destination", () => {
    const location = {
      label: "Airport",
      position: [18.1, -15.94],
      city: "Nouakchott",
    };
    storeRebookDestination(location);
    expect(consumeRebookDestination()).toEqual(location);
    expect(consumeRebookDestination()).toBeNull();
  });

  it("builds a location from history coordinates", () => {
    const location = locationFromHistoryTrip({
      destination_address: "Airport",
      destination_lat: 18.1,
      destination_lng: -15.94,
      city: "Nouakchott",
    });
    expect(location.position).toEqual([18.1, -15.94]);
  });
});
