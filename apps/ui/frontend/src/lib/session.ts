import type { StorageLike } from "./types";

export function readSessionFlag(storage: StorageLike | undefined, key: string): boolean {
  if (!storage) {
    return false;
  }

  return storage.getItem(key) === "1";
}

export function writeSessionFlag(
  storage: StorageLike | undefined,
  key: string,
  value: boolean,
): void {
  if (!storage) {
    return;
  }

  if (value) {
    storage.setItem(key, "1");
  } else {
    storage.removeItem(key);
  }
}
