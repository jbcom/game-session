import { setGameRuntimePaused } from "./runtimePause.js";

/** Why a surface was asked to close. */
export type SurfaceDismissReason = "escape" | "back" | "backdrop" | "close";

/** Returns `true` when it consumed the back press. */
export type SurfaceBackHandler = () => boolean;

/**
 * Anything that keeps a last-in-first-out stack of back handlers. The
 * `AppLifecycle` returned by `capacitor-device-profile`'s `createAppLifecycle`
 * satisfies this structurally, so no import of that package is needed.
 */
export interface SurfaceBackSource {
  /** Pushes a handler and returns a function that removes it. */
  pushBackHandler(handler: SurfaceBackHandler): () => void;
}

/** Options for {@link createSurfaceStack}. */
export interface SurfaceStackOptions {
  /** The document to manage. Defaults to the global `document`; with none, every call is a no-op. */
  document?: Document;
  /**
   * A back-button source. While at least one surface is open, one handler is
   * pushed on it that closes the top surface and always reports the press as
   * consumed, so a back press never reaches whatever is behind the surfaces.
   */
  back?: SurfaceBackSource;
  /** Exit pointer lock when the first surface opens. Defaults to `true`. */
  releasePointerLock?: boolean;
}

/** A surface to register with a {@link SurfaceStack}. */
export interface SurfaceRegistration {
  /** The element that holds the surface's content. Focus is kept inside it while it is on top. */
  container: HTMLElement;
  /** Whether this surface counts toward {@link SurfaceSnapshot.pausing}. Defaults to `true`. */
  pauses?: boolean;
  /**
   * Called when Escape or back reaches this surface while it is on top. When
   * omitted the surface is non-dismissible: Escape and back are still consumed
   * but nothing closes.
   */
  onDismiss?: (reason: SurfaceDismissReason) => void;
  /** Where focus returns on release. Defaults to the focused element at registration. */
  opener?: HTMLElement | null;
  /** Overrides `opener`, resolved at release time (for an opener that is replaced while the surface is open). */
  returnFocus?: () => HTMLElement | null | undefined;
  /** Chooses the element focused on registration. Defaults to `[data-autofocus]`, then the first tabbable, then the container. */
  initialFocus?: () => HTMLElement | null | undefined;
}

/** A registered surface. */
export interface SurfaceHandle {
  /**
   * Replaces the live `pauses` and `onDismiss` of the registration without
   * re-registering. Both are required: this sets them, it does not merge.
   */
  update(next: { pauses: boolean; onDismiss: SurfaceRegistration["onDismiss"] }): void;
  /** Removes the surface and returns focus. Safe to call more than once. */
  release(): void;
}

/** A stable view of the stack; a new object is produced only when a field changes. */
export interface SurfaceSnapshot {
  /** How many surfaces are open. */
  readonly depth: number;
  /** `true` while at least one open surface has `pauses` set. The signal a host maps to a pause reason. */
  readonly pausing: boolean;
}

/** The set of open surfaces: focus, Escape, back and the pause signal live here. */
export interface SurfaceStack {
  /** Opens a surface on top of the stack. */
  register(registration: SurfaceRegistration): SurfaceHandle;
  /**
   * The element that holds focus now, or `null` for the body or nothing: what
   * a surface opened this instant would return focus to. A UI layer calls this
   * during render, before any child can take focus, and passes the result as
   * `opener`.
   */
  captureOpener(): HTMLElement | null;
  /**
   * Asks the top surface to close, as Escape or back would.
   *
   * @returns `true` when a surface was open and consumed the request.
   */
  dismiss(reason?: SurfaceDismissReason): boolean;
  /** The current snapshot; its identity changes only when a field does. */
  getSnapshot(): SurfaceSnapshot;
  /** Calls `listener` synchronously on every change to the snapshot. */
  subscribe(listener: () => void): () => void;
  /**
   * Calls `listener(true)` when the first pausing surface opens and
   * `listener(false)` when the last closes. Delivery is coalesced to a
   * microtask, so a surface that closes and reopens in the same task (React's
   * development double-mount) produces no event. Not called with the current
   * value on subscribe.
   */
  onPausingChange(listener: (pausing: boolean) => void): () => void;
  /** Releases every surface, detaches every listener and forgets every subscriber. */
  dispose(): void;
}

interface Entry {
  container: HTMLElement;
  pauses: boolean;
  onDismiss: ((reason: SurfaceDismissReason) => void) | undefined;
  opener: HTMLElement | null;
  returnFocus: SurfaceRegistration["returnFocus"];
  initialFocus: SurfaceRegistration["initialFocus"];
  hadTabIndex: boolean;
  /**
   * Surfaces released while this one was above them. Their openers are tried
   * after this one's own, so closing a parent before its nested child (React
   * unmounts a parent's effects first) still lands focus where the outermost
   * surface was opened from.
   */
  inherited: Entry[];
}

// Two stacks on one document (or a stack and another focus trap) would each
// pull focus back from the other without end; one pull at a time breaks that.
let pullingFocus = false;

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "audio[controls]",
  "video[controls]",
  "iframe",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(",");

function isTabbable(element: HTMLElement) {
  if (element.tabIndex < 0) return false;
  if (element.matches(':disabled, input[type="hidden"]')) return false;
  if (element.closest("[hidden], [inert]")) return false;
  return element.checkVisibility ? element.checkVisibility({ visibilityProperty: true }) : true;
}

// A browser tabs to one radio in a group (the checked one, else the first), so
// the others are not stops: counting them would put a wrap point where Tab
// never lands.
function radioStops(items: HTMLElement[]) {
  // A group is the radios of one form (or of none) that share a name.
  const groups = new Map<HTMLFormElement | null, Map<string, HTMLInputElement>>();
  const skipped = new Set<HTMLElement>();
  for (const item of items) {
    if (!item.matches('input[type="radio"][name]')) continue;
    const radio = item as HTMLInputElement;
    const named = groups.get(radio.form) ?? new Map<string, HTMLInputElement>();
    groups.set(radio.form, named);
    const kept = named.get(radio.name);
    if (!kept) {
      named.set(radio.name, radio);
    } else if (radio.checked && !kept.checked) {
      skipped.add(kept);
      named.set(radio.name, radio);
    } else {
      skipped.add(radio);
    }
  }
  return items.filter((item) => !skipped.has(item));
}

function tabbablesIn(container: HTMLElement) {
  return radioStops(
    Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(isTabbable)
  );
}

function usable(
  element: HTMLElement | null | undefined,
  container?: HTMLElement
): element is HTMLElement {
  if (!element?.isConnected) return false;
  if (container && !container.contains(element)) return false;
  return !element.closest("[inert]");
}

/**
 * Creates a stack of open surfaces (dialogs, drawers, sheets or anything else
 * that covers the page). The stack owns what a covering surface needs and the
 * page cannot do per surface:
 *
 * - Only the top surface takes focus, and Tab and Shift+Tab wrap inside it.
 *   Surfaces below it, and the page behind them, are unreachable by keyboard.
 *   A surface may be a DOM descendant of the one beneath it.
 * - Escape and the back button close the top surface only. Both are consumed
 *   even when that surface is non-dismissible, so neither leaks to a handler
 *   behind it. Escape is intercepted in the capture phase on `window`.
 * - Closing a surface returns focus to the element that was focused when it
 *   opened, or to the surface beneath when that element has gone.
 * - {@link SurfaceStack.getSnapshot} and {@link SurfaceStack.onPausingChange}
 *   report whether anything pausing is open, for the host to map to its own
 *   pause reason.
 *
 * @param options - The document, back-button source and pointer-lock policy.
 */
export function createSurfaceStack(options: SurfaceStackOptions = {}): SurfaceStack {
  const doc = options.document ?? (typeof document === "undefined" ? undefined : document);
  const entries: Entry[] = [];
  const listeners = new Set<() => void>();
  const pausingListeners = new Set<(pausing: boolean) => void>();
  let snapshot: SurfaceSnapshot = { depth: 0, pausing: false };
  let delivered = false;
  let flushScheduled = false;
  let removeBack: (() => void) | undefined;
  let detach: (() => void) | undefined;

  const top = () => entries.at(-1);

  function refresh() {
    const depth = entries.length;
    const pausing = entries.some((entry) => entry.pauses);
    if (snapshot.depth === depth && snapshot.pausing === pausing) return;
    snapshot = { depth, pausing };
    for (const listener of [...listeners]) listener();
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(() => {
        flushScheduled = false;
        if (snapshot.pausing === delivered) return;
        delivered = snapshot.pausing;
        for (const listener of [...pausingListeners]) listener(delivered);
      });
    }
  }

  function focusInto(entry: Entry) {
    const { container } = entry;
    const chosen = entry.initialFocus?.();
    if (usable(chosen, container)) {
      chosen.focus();
      return;
    }
    const marked = container.querySelector<HTMLElement>("[data-autofocus]");
    if (marked) {
      marked.focus();
      return;
    }
    // A child that took focus itself (React's `autoFocus`) keeps it.
    const held = container.ownerDocument.activeElement;
    if (held !== container && container.contains(held)) return;
    (tabbablesIn(container)[0] ?? container).focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    // The listener is attached only while a surface is open, so there is a top.
    const current = entries[entries.length - 1] as Entry;

    if (event.key === "Escape") {
      // Always kept from the host. An Escape that ends or cancels an IME
      // composition (Safari reports it with keyCode 229 after the composition
      // has ended) belongs to the input method and dismisses nothing; holding
      // the key dismisses one surface, not the whole stack.
      event.stopImmediatePropagation();
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!event.repeat) current.onDismiss?.("escape");
      return;
    }

    if (event.key !== "Tab") return;
    const items = tabbablesIn(current.container);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      current.container.focus();
      return;
    }
    const active = current.container.ownerDocument.activeElement;
    const inside = current.container.contains(active);
    if (event.shiftKey) {
      if (!inside || active === first || active === current.container) {
        event.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onFocusIn(event: FocusEvent) {
    const current = top();
    // composedPath, not target: inside an open shadow root the target is
    // retargeted to the host, which is outside the container.
    if (!current || pullingFocus || event.composedPath().includes(current.container)) return;
    pullingFocus = true;
    try {
      focusInto(current);
    } finally {
      pullingFocus = false;
    }
  }

  function attach(target: Document) {
    const view: EventTarget = target.defaultView ?? target;
    view.addEventListener("keydown", onKeyDown as EventListener, true);
    target.addEventListener("focusin", onFocusIn as EventListener, true);
    detach = () => {
      view.removeEventListener("keydown", onKeyDown as EventListener, true);
      target.removeEventListener("focusin", onFocusIn as EventListener, true);
    };
  }

  function dismiss(reason: SurfaceDismissReason = "back") {
    const current = top();
    if (!current) return false;
    current.onDismiss?.(reason);
    return true;
  }

  function restoreFocus(released: Entry) {
    const queue = [released];
    for (const entry of queue) {
      const requested = entry.returnFocus?.() ?? entry.opener;
      if (usable(requested)) {
        requested.focus();
        return;
      }
      queue.push(...entry.inherited);
    }
    const below = top();
    if (below) focusInto(below);
  }

  function captureOpener() {
    if (!doc) return null;
    const active = doc.activeElement;
    return active && active !== doc.body && active !== doc.documentElement
      ? (active as HTMLElement)
      : null;
  }

  function register(registration: SurfaceRegistration): SurfaceHandle {
    if (!doc) return { update() {}, release() {} };

    const entry: Entry = {
      container: registration.container,
      pauses: registration.pauses ?? true,
      onDismiss: registration.onDismiss,
      opener: registration.opener === undefined ? captureOpener() : registration.opener,
      returnFocus: registration.returnFocus,
      initialFocus: registration.initialFocus,
      hadTabIndex: registration.container.hasAttribute("tabindex"),
      inherited: [],
    };
    if (!entry.hadTabIndex) entry.container.tabIndex = -1;

    if (entries.length === 0) {
      attach(doc);
      if (options.releasePointerLock !== false && doc.pointerLockElement) doc.exitPointerLock();
      if (options.back) {
        removeBack = options.back.pushBackHandler(() => dismiss("back"));
      }
    }
    entries.push(entry);
    refresh();
    focusInto(entry);

    let released = false;
    return {
      update(next) {
        entry.pauses = next.pauses;
        entry.onDismiss = next.onDismiss;
        refresh();
      },
      release() {
        const index = entries.indexOf(entry);
        // Already released, or the stack was disposed under it.
        if (released || index < 0) return;
        released = true;
        const wasTop = top() === entry;
        entries.splice(index, 1);
        if (!entry.hadTabIndex) entry.container.removeAttribute("tabindex");
        if (entries.length === 0) {
          detach?.();
          detach = undefined;
          removeBack?.();
          removeBack = undefined;
        }
        refresh();
        if (wasTop) {
          restoreFocus(entry);
        } else {
          // Released from beneath a surface that is still open: whatever
          // closes that one next inherits this one's opener.
          (entries[index] as Entry).inherited.push(entry);
        }
      },
    };
  }

  return {
    register,
    captureOpener,
    dismiss,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onPausingChange(listener) {
      pausingListeners.add(listener);
      return () => {
        pausingListeners.delete(listener);
      };
    },
    dispose() {
      for (const entry of [...entries].reverse()) {
        if (!entry.hadTabIndex) entry.container.removeAttribute("tabindex");
      }
      entries.length = 0;
      detach?.();
      detach = undefined;
      removeBack?.();
      removeBack = undefined;
      refresh();
      // The host was told a pausing surface opened, so tell it none is open
      // now: the coalesced notification would find no one left to hear it.
      if (delivered) {
        delivered = false;
        for (const listener of [...pausingListeners]) listener(false);
      }
      listeners.clear();
      pausingListeners.clear();
    },
  };
}

/**
 * Mirrors a stack's pausing signal onto the package's module-level pause flag
 * ({@link setGameRuntimePaused}): the flag is set while a pausing surface is
 * open and cleared when the last closes. If a pausing surface is already open
 * when this is called the flag is set at once; when none is open the flag is
 * left as it is, since something else may have paused. Opt-in; a host with its
 * own pause model maps {@link SurfaceStack.onPausingChange} itself instead.
 *
 * @returns A function that stops mirroring.
 */
export function bindSurfacePauseFlag(stack: SurfaceStack) {
  if (stack.getSnapshot().pausing) setGameRuntimePaused(true);
  return stack.onPausingChange(setGameRuntimePaused);
}
