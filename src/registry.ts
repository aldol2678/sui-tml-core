export const knownEffects = [
  "storage.read",
  "storage.write",
  "network.read",
  "network.write",
  "external.send",
  "state.delete",
] as const;

export const builtinTypes = ["Bool", "Int", "Text", "Unit"] as const;
