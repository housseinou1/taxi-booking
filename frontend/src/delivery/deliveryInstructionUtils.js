export const INSTRUCTION_FIELD_DEFS = [
  {
    key: "building_description",
    label: "Building / house description",
    icon: "🏠",
    placeholder: "Blue villa with white fence",
  },
  {
    key: "apartment_floor",
    label: "Apartment / floor",
    icon: "🚪",
    placeholder: "Apt 4B, 2nd floor",
  },
  {
    key: "landmark",
    label: "Nearby landmark",
    icon: "📍",
    placeholder: "Opposite Total station",
  },
  {
    key: "gate_color",
    label: "Gate color",
    icon: "🚧",
    placeholder: "Green metal gate",
  },
  {
    key: "extra_instructions",
    label: "Extra instructions",
    icon: "📝",
    placeholder: "Ring bell twice, leave at door...",
    multiline: true,
  },
];

export function emptyInstructions() {
  return {
    building_description: "",
    apartment_floor: "",
    landmark: "",
    gate_color: "",
    extra_instructions: "",
  };
}

export function instructionsFromSavedAddress(address) {
  if (!address) return emptyInstructions();
  return {
    building_description: address.building_description || "",
    apartment_floor: address.apartment_floor || "",
    landmark: address.landmark || "",
    gate_color: address.gate_color || "",
    extra_instructions: address.extra_instructions || "",
  };
}

export function instructionsFromDefaults(defaults) {
  if (!defaults) return emptyInstructions();
  return {
    building_description: defaults.building_description || "",
    apartment_floor: defaults.apartment_floor || "",
    landmark: defaults.landmark || "",
    gate_color: defaults.gate_color || "",
    extra_instructions: defaults.extra_instructions || "",
  };
}

export function instructionRows(instructions) {
  const source = instructions || emptyInstructions();
  return INSTRUCTION_FIELD_DEFS.map((field) => ({
    key: field.key,
    label: field.label,
    icon: field.icon,
    value: String(source[field.key] || "").trim(),
  })).filter((row) => row.value);
}

export function hasInstructionContent(instructions) {
  return instructionRows(instructions).length > 0;
}

export function mergeInstructions(target, patch) {
  return { ...emptyInstructions(), ...target, ...patch };
}
