// Decouples the repository (emits "data changed") from the sync engine (listens).
const subs = new Set<() => void>();
export const onDirty = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const emitDirty = () => subs.forEach((f) => f());
