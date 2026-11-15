import { describe, expect, it, vi } from "vitest";
import { createPreferencesStore, type PreferencesStorage } from "../src/index.js";

const defaults = Object.freeze({ scale: 1 });
const parse = (value: unknown) => {
  const candidate = value as { scale?: unknown } | null;
  if (!candidate || typeof candidate.scale !== "number" || !Number.isFinite(candidate.scale)) {
    throw new Error("Invalid scale");
  }
  return Object.freeze({ scale: candidate.scale });
};
function storage(initial: string | null = null): PreferencesStorage {
  let raw = initial;
  return {
    get: vi.fn(async () => raw),
    set: vi.fn(async (_key, text) => {
      raw = text;
    }),
  };
}
const open = (kv = storage()) =>
  createPreferencesStore({ storage: kv, key: "settings", defaults, parse });

describe("async preferences external store", () => {
  it("loads once before returning and keeps stable immutable snapshots", async () => {
    const kv = storage('{"scale":0.75}');
    const store = await open(kv);
    expect(store.snapshot()).toEqual({ value: { scale: 0.75 }, persistence: "saved" });
    expect(store.snapshot()).toBe(store.snapshot());
    expect(Object.isFrozen(store.snapshot())).toBe(true);
    expect(Object.isFrozen(store.snapshot().value)).toBe(true);
    expect(await store.flush()).toBe(true);
    expect(kv.set).not.toHaveBeenCalled();
  });

  it("uses defaults without writing when no settings exist", async () => {
    const store = await open();
    expect(store.snapshot()).toEqual({ value: defaults, persistence: "idle" });
    expect(await store.flush()).toBe(true);
  });

  it.each(["{", '{"scale":"bad"}'])(
    "reports corrupt reads and retains defaults: %s",
    async (raw) => {
      const kv = storage(raw);
      const store = await open(kv);
      expect(store.snapshot()).toEqual({ value: defaults, persistence: "failed" });
      expect(await store.flush()).toBe(false);
      expect(kv.set).not.toHaveBeenCalled();
    }
  );

  it("recovers from unavailable reads and writes on explicit edits", async () => {
    const kv = storage();
    vi.mocked(kv.get).mockRejectedValueOnce(new Error("Blocked"));
    const store = await open(kv);
    expect(store.snapshot().persistence).toBe("failed");
    expect(store.set({ scale: 0.5 })).toBe(true);
    expect(await store.flush()).toBe(true);
    expect(store.snapshot()).toEqual({ value: { scale: 0.5 }, persistence: "saved" });
  });

  it("rejects invalid updates atomically", async () => {
    const kv = storage();
    const store = await open(kv);
    const before = store.snapshot();
    expect(store.set({ scale: Number.NaN })).toBe(false);
    expect(store.snapshot()).toBe(before);
    expect(kv.set).not.toHaveBeenCalled();
    await expect(
      createPreferencesStore({ storage: kv, key: "k", defaults: null, parse })
    ).rejects.toThrow();
    const nonJson = await createPreferencesStore({
      storage: kv,
      key: "k",
      defaults: undefined,
      parse: () => undefined,
    });
    expect(nonJson.set(undefined)).toBe(false);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const cyclic = await createPreferencesStore({
      storage: kv,
      key: "k",
      defaults: cycle,
      parse: () => cycle,
    });
    expect(cyclic.set(cycle)).toBe(false);
  });

  it("publishes immediate edits and serializes asynchronous writes without stale status", async () => {
    const kv = storage();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const set = vi.mocked(kv.set).getMockImplementation();
    if (!set) throw new Error("Missing storage implementation");
    vi.mocked(kv.set).mockImplementationOnce(async (key, text) => {
      await held;
      await set(key, text);
    });
    const store = await open(kv);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const broken = store.subscribe(() => {
      throw new Error("Observer");
    });
    expect(store.set({ scale: 0.75 })).toBe(true);
    expect(store.set({ scale: 0.5 })).toBe(true);
    expect(store.snapshot()).toEqual({ value: { scale: 0.5 }, persistence: "saving" });
    release();
    expect(await store.flush()).toBe(true);
    expect(kv.set).toHaveBeenNthCalledWith(1, "settings", '{"scale":0.75}');
    expect(kv.set).toHaveBeenNthCalledWith(2, "settings", '{"scale":0.5}');
    expect(store.snapshot()).toEqual({ value: { scale: 0.5 }, persistence: "saved" });
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    broken();
    store.set({ scale: 1 });
    await store.flush();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it.each(["reject", "drop", "readback"])(
    "reports %s write failure and permits retry",
    async (failure) => {
      const kv = storage();
      const store = await open(kv);
      if (failure === "reject") vi.mocked(kv.set).mockRejectedValueOnce(new Error("Quota"));
      if (failure === "drop") vi.mocked(kv.set).mockResolvedValueOnce(undefined);
      if (failure === "readback") vi.mocked(kv.get).mockRejectedValueOnce(new Error("Read"));
      store.set({ scale: 0.5 });
      expect(await store.flush()).toBe(false);
      expect(store.snapshot()).toEqual({ value: { scale: 0.5 }, persistence: "failed" });
      store.set({ scale: 0.75 });
      expect(await store.flush()).toBe(true);
      expect(store.snapshot().persistence).toBe("saved");
    }
  );
});
