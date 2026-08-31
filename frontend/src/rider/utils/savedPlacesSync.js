import {
  createSavedAddress,
  deleteSavedAddress,
  listSavedAddresses,
  updateSavedAddress,
} from "../../security/securityApi";
import { loadSavedPlaces, SAVED_PLACES_STORAGE_KEY } from "./savedPlacesStorage";

function localPlaceToAddressPayload(place) {
  const position = Array.isArray(place?.position) ? place.position : [];
  return {
    label: place.name || place.type || "Saved place",
    address: place.location || place.address || "",
    latitude: position[0] ?? null,
    longitude: position[1] ?? null,
    is_default: Boolean(place.isDefault),
    extra_instructions: place.note || "",
  };
}

export function addressToLocalPlace(address) {
  const label = String(address.label || "").toLowerCase();
  let type = "Favorite";
  if (label.includes("home")) type = "Home";
  else if (label.includes("work")) type = "Work";

  return {
    id: address.id ? `remote-${address.id}` : `favorite-${Date.now()}`,
    remoteId: address.id,
    type,
    name: address.label || type,
    city: "Nouakchott",
    location: address.address,
    note: address.extra_instructions || "",
    position:
      address.latitude != null && address.longitude != null
        ? [Number(address.latitude), Number(address.longitude)]
        : null,
    isDefault: Boolean(address.is_default),
    favorite: type === "Favorite",
  };
}

export async function syncSavedPlacesFromServer() {
  const localPlaces = loadSavedPlaces();
  try {
    const remote = await listSavedAddresses();
    if (!Array.isArray(remote) || remote.length === 0) {
      return localPlaces;
    }
    const merged = remote.map(addressToLocalPlace);
    localStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (error) {
    return localPlaces;
  }
}

export async function persistPlaceToServer(place) {
  const payload = localPlaceToAddressPayload(place);
  if (place.remoteId) {
    return updateSavedAddress(place.remoteId, payload);
  }
  const created = await createSavedAddress(payload);
  return created;
}

export async function removePlaceFromServer(place) {
  if (!place?.remoteId) return;
  await deleteSavedAddress(place.remoteId);
}

export async function setDefaultPlaceOnServer(place, places) {
  const updates = places.map((item) =>
    persistPlaceToServer({
      ...item,
      isDefault: item.id === place.id,
    })
  );
  await Promise.all(updates);
}
