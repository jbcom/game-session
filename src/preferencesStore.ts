/** Async string storage; compatible with persistence-save's PreferencesKv. */
export interface PreferencesStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** Persistence describes storage only, never whether a renderer applied a setting. */
export type PreferencesPersistence = "idle" | "saving" | "saved" | "failed";

/** Stable external-store snapshot, suitable for React's useSyncExternalStore. */
export interface PreferencesSnapshot<T> {
  readonly value: T;
  readonly persistence: PreferencesPersistence;
}

/** One store per mounted application; it owns no gameplay, DOM or renderer. */
export interface PreferencesStore<T> {
  snapshot(): PreferencesSnapshot<T>;
  subscribe(listener: () => void): () => void;
  /** Validate and apply immediately; false leaves memory and storage untouched. */
  set(value: unknown): boolean;
  /** Wait for writes queued before this call and their read-backs. False reports a storage failure. */
  flush(): Promise<boolean>;
}

/**
 * Load before mounting consumers, avoiding late hydration overwriting user edits.
 * The application validates/clones/freezes its own schema in `parse`; invalid
 * input must throw. The same parser checks defaults, stored JSON and updates.
 * Storage and corrupt-read failures retain usable defaults. Updates remain
 * usable in memory after write failure, with a truthful persistence status.
 */
export async function createPreferencesStore<T>(options: {
  storage: PreferencesStorage;
  key: string;
  defaults: T;
  parse: (value: unknown) => T;
}): Promise<PreferencesStore<T>> {
  let value = options.parse(options.defaults);
  let persistence: PreferencesPersistence = "idle";
  try {
    const raw = await options.storage.get(options.key);
    if (raw !== null) {
      value = options.parse(JSON.parse(raw));
      persistence = "saved";
    }
  } catch {
    persistence = "failed";
  }
  let current: PreferencesSnapshot<T> = Object.freeze({ value, persistence });
  const listeners = new Set<() => void>();
  let writes: Promise<boolean> = Promise.resolve(persistence !== "failed");
  let revision = 0;
  const publish = (next: PreferencesSnapshot<T>) => {
    current = Object.freeze(next);
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A failed observer must not cancel persistence or other observers.
      }
    }
  };
  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(candidate) {
      let next: T;
      let text: string | undefined;
      try {
        next = options.parse(candidate);
        text = JSON.stringify(next);
        if (text === undefined) return false;
      } catch {
        return false;
      }
      const ownRevision = ++revision;
      writes = writes.then(async () => {
        let saved = false;
        try {
          await options.storage.set(options.key, text);
          saved = (await options.storage.get(options.key)) === text;
        } catch {
          // Keep the accepted in-memory choice and permit a later retry.
        }
        if (revision === ownRevision) {
          publish({ value: current.value, persistence: saved ? "saved" : "failed" });
        }
        return saved;
      });
      publish({ value: next, persistence: "saving" });
      return true;
    },
    flush: () => writes,
  };
}
