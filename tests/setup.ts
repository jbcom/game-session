// Node 26 ships an experimental global `localStorage`/`sessionStorage` accessor
// (disabled unless --localstorage-file is passed). Its mere presence on
// globalThis makes vitest's jsdom-environment populateGlobal() treat the key
// as "already user-defined" (`k in global` short-circuits the copy) and skip
// mirroring jsdom's real Storage implementation onto `global`/`window` for it.
// Net effect: both bare `localStorage` and `window.localStorage` resolve to
// `undefined` under jsdom, even though jsdom's underlying window has a working
// Storage. Vitest's jsdom environment stashes the raw JSDOM instance at
// `globalThis.jsdom` (see its environments/jsdom.js `setup()`) -- pull the real
// Storage off that and mirror it explicitly so both the tests and the
// package's own `getStorage()` (which reads `window.localStorage`) work.
const rawWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;

if (rawWindow?.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: rawWindow.localStorage,
    writable: true,
  });
}

if (rawWindow?.sessionStorage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    enumerable: true,
    value: rawWindow.sessionStorage,
    writable: true,
  });
}
