// A synthetic stand-in for browser local storage.
export function fakeStorage(entries = {}) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    getItem: key => items.has(key) ? items.get(key) : null,
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: key => { items.delete(key); }
  };
}
