import { addressToLocalPlace } from "./savedPlacesSync";

describe("savedPlacesSync", () => {
  it("maps backend address to local place shape", () => {
    const place = {
      label: "Home",
      address: "Airport Road",
      latitude: 18.1,
      longitude: -15.9,
      is_default: true,
      extra_instructions: "Gate B",
      id: 7,
    };

    expect(addressToLocalPlace(place)).toMatchObject({
      remoteId: 7,
      type: "Home",
      location: "Airport Road",
      isDefault: true,
      note: "Gate B",
    });
  });
});
