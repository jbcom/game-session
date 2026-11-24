// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isGameRuntimePaused } from "../src/runtimePause";
import {
  bindSurfacePauseFlag,
  createSurfaceStack,
  type SurfaceBackHandler,
  type SurfaceStack,
} from "../src/surfaceStack";

function surfaceWith(...labels: string[]) {
  const container = document.createElement("div");
  const buttons = labels.map((label) => {
    const button = document.createElement("button");
    button.textContent = label;
    container.append(button);
    return button;
  });
  document.body.append(container);
  return { container, buttons };
}

function opener(label = "opener") {
  const button = document.createElement("button");
  button.textContent = label;
  document.body.append(button);
  button.focus();
  return button;
}

function backSource() {
  const handlers: SurfaceBackHandler[] = [];
  return {
    handlers,
    pushBackHandler: vi.fn((handler: SurfaceBackHandler) => {
      handlers.push(handler);
      return () => {
        handlers.splice(handlers.indexOf(handler), 1);
      };
    }),
  };
}

let stack: SurfaceStack;

beforeEach(() => {
  stack = createSurfaceStack();
});

afterEach(() => {
  stack.dispose();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-game-paused");
});

describe("snapshot and subscriptions", () => {
  test("starts empty with a stable snapshot", () => {
    expect(stack.getSnapshot()).toEqual({ depth: 0, pausing: false });
    expect(stack.getSnapshot()).toBe(stack.getSnapshot());
  });

  test("depth and pausing follow registrations, and the snapshot changes identity only on change", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const first = stack.register({ container: a.container });
    const afterFirst = stack.getSnapshot();
    expect(afterFirst).toEqual({ depth: 1, pausing: true });

    const second = stack.register({ container: b.container, pauses: false });
    expect(stack.getSnapshot()).toEqual({ depth: 2, pausing: true });

    first.release();
    expect(stack.getSnapshot()).toEqual({ depth: 1, pausing: false });
    second.release();
    expect(stack.getSnapshot()).toEqual({ depth: 0, pausing: false });
  });

  test("update re-evaluates pausing without re-registering, and a no-op update keeps the snapshot", () => {
    const { container } = surfaceWith("a");
    const handle = stack.register({ container, pauses: false });
    const before = stack.getSnapshot();
    expect(before.pausing).toBe(false);

    handle.update({ onDismiss: undefined, pauses: false });
    expect(stack.getSnapshot()).toBe(before);

    handle.update({ onDismiss: undefined, pauses: true });
    expect(stack.getSnapshot()).toEqual({ depth: 1, pausing: true });
  });

  test("subscribe fires on every change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const stop = stack.subscribe(listener);
    const { container } = surfaceWith("a");
    const handle = stack.register({ container });
    expect(listener).toHaveBeenCalledTimes(1);
    handle.release();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    stack.register({ container }).release();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("onPausingChange reports the edges once, in a microtask, and ignores nested surfaces", async () => {
    const listener = vi.fn();
    stack.onPausingChange(listener);
    const a = surfaceWith("a");
    const b = surfaceWith("b");

    const first = stack.register({ container: a.container });
    const second = stack.register({ container: b.container });
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener.mock.calls).toEqual([[true]]);

    second.release();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    first.release();
    await Promise.resolve();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  test("onPausingChange is silent when a surface closes and reopens in one task", async () => {
    const listener = vi.fn();
    stack.onPausingChange(listener);
    const { container } = surfaceWith("a");

    stack.register({ container }).release();
    stack.register({ container });
    await Promise.resolve();
    expect(listener.mock.calls).toEqual([[true]]);

    stack.dispose();
    await Promise.resolve();
  });

  test("onPausingChange is silent when nothing changed by the time the microtask runs", async () => {
    const listener = vi.fn();
    stack.onPausingChange(listener);
    const { container } = surfaceWith("a");
    stack.register({ container }).release();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });

  test("onPausingChange stops after unsubscribe", async () => {
    const listener = vi.fn();
    const stop = stack.onPausingChange(listener);
    stop();
    const { container } = surfaceWith("a");
    stack.register({ container });
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });

  test("dispose tells a host that was told a pausing surface opened that none is open now", async () => {
    const listener = vi.fn();
    stack.onPausingChange(listener);
    const { container } = surfaceWith("a");
    stack.register({ container });
    await Promise.resolve();
    stack.dispose();
    await Promise.resolve();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  test("dispose says nothing to a host that never heard the surface open", async () => {
    const listener = vi.fn();
    stack.onPausingChange(listener);
    const { container } = surfaceWith("a");
    stack.register({ container });
    stack.dispose();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });

  test("bindSurfacePauseFlag sets the flag at once when a pausing surface is already open", async () => {
    const { container } = surfaceWith("a");
    stack.register({ container });
    const stop = bindSurfacePauseFlag(stack);
    expect(isGameRuntimePaused()).toBe(true);
    stop();
  });

  test("bindSurfacePauseFlag leaves the flag alone when nothing is open", () => {
    document.documentElement.dataset.gamePaused = "true";
    const stop = bindSurfacePauseFlag(stack);
    expect(isGameRuntimePaused()).toBe(true);
    stop();
  });

  test("bindSurfacePauseFlag leaves the flag as it found it when a surface opens and closes in one task", async () => {
    document.documentElement.dataset.gamePaused = "false";
    const stop = bindSurfacePauseFlag(stack);
    const { container } = surfaceWith("a");
    stack.register({ container }).release();
    await Promise.resolve();
    expect(isGameRuntimePaused()).toBe(false);
    stop();
  });

  test("bindSurfacePauseFlag clears the flag it set when the stack is disposed", () => {
    bindSurfacePauseFlag(stack);
    const { container } = surfaceWith("a");
    stack.register({ container });
    expect(isGameRuntimePaused()).toBe(true);
    stack.dispose();
    expect(isGameRuntimePaused()).toBe(false);
  });

  test("bindSurfacePauseFlag mirrors the signal onto the runtime pause flag", async () => {
    const stop = bindSurfacePauseFlag(stack);
    const { container } = surfaceWith("a");
    const handle = stack.register({ container });
    await Promise.resolve();
    expect(isGameRuntimePaused()).toBe(true);
    handle.release();
    await Promise.resolve();
    expect(isGameRuntimePaused()).toBe(false);
    stop();
  });
});

describe("Escape", () => {
  test("closes only the top surface and is consumed before any host listener", () => {
    const hostListener = vi.fn();
    window.addEventListener("keydown", hostListener);
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const lower = vi.fn();
    const upper = vi.fn();
    stack.register({ container: a.container, onDismiss: lower });
    stack.register({ container: b.container, onDismiss: upper });

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);

    expect(upper).toHaveBeenCalledExactlyOnceWith("escape");
    expect(lower).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(hostListener).not.toHaveBeenCalled();
    window.removeEventListener("keydown", hostListener);
  });

  test("is consumed by a non-dismissible surface without closing anything", () => {
    const hostListener = vi.fn();
    window.addEventListener("keydown", hostListener);
    const { container } = surfaceWith("a");
    stack.register({ container });

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(hostListener).not.toHaveBeenCalled();
    expect(stack.getSnapshot().depth).toBe(1);
    window.removeEventListener("keydown", hostListener);
  });

  test("uses the live onDismiss after update", () => {
    const { container } = surfaceWith("a");
    const stale = vi.fn();
    const live = vi.fn();
    const handle = stack.register({ container, onDismiss: stale });
    handle.update({ onDismiss: live, pauses: true });
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(live).toHaveBeenCalledWith("escape");
    expect(stale).not.toHaveBeenCalled();
  });

  test("passes through when no surface is open, and stops listening after the last closes", () => {
    const hostListener = vi.fn();
    window.addEventListener("keydown", hostListener);
    const { container } = surfaceWith("a");
    stack.register({ container }).release();

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(hostListener).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", hostListener);
  });

  test.each([
    ["ends an IME composition", { isComposing: true }],
    ["is reported by Safari after one with keyCode 229", { keyCode: 229 }],
  ])("an Escape that %s dismisses nothing, but is still kept from the host", (_name, init) => {
    const host = vi.fn();
    window.addEventListener("keydown", host);
    const { container } = surfaceWith("a");
    const onDismiss = vi.fn();
    stack.register({ container, onDismiss });
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.activeElement?.dispatchEvent(event);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(host).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    window.removeEventListener("keydown", host);
  });

  test("holding Escape dismisses one surface, not the stack", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const lower = vi.fn();
    const upper = vi.fn();
    stack.register({ container: a.container, onDismiss: lower });
    stack.register({ container: b.container, onDismiss: upper });
    for (const repeat of [false, true, true]) {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", repeat, bubbles: true, cancelable: true })
      );
    }
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  test("ignores keys other than Escape and Tab", () => {
    const { container } = surfaceWith("a");
    const onDismiss = vi.fn();
    stack.register({ container, onDismiss });
    const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("listens on the document when it has no window", () => {
    const detached = document.implementation.createHTMLDocument("detached");
    const own = createSurfaceStack({ document: detached });
    const container = detached.createElement("div");
    const button = detached.createElement("button");
    container.append(button);
    detached.body.append(container);
    const onDismiss = vi.fn();
    const handle = own.register({ container, onDismiss });
    expect(detached.defaultView).toBeNull();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onDismiss).toHaveBeenCalledWith("escape");
    handle.release();
    own.dispose();
  });
});

describe("back", () => {
  test("dismiss closes the top surface and reports whether one consumed it", () => {
    expect(stack.dismiss()).toBe(false);
    const { container } = surfaceWith("a");
    const onDismiss = vi.fn();
    stack.register({ container, onDismiss });
    expect(stack.dismiss()).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith("back");
    expect(stack.dismiss("close")).toBe(true);
    expect(onDismiss).toHaveBeenLastCalledWith("close");
  });

  test("dismiss consumes a press for a non-dismissible surface", () => {
    const { container } = surfaceWith("a");
    stack.register({ container });
    expect(stack.dismiss()).toBe(true);
    expect(stack.getSnapshot().depth).toBe(1);
  });

  test("pushes one handler on the back source while a surface is open, and removes it after the last", () => {
    const back = backSource();
    stack.dispose();
    stack = createSurfaceStack({ back });
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    expect(back.pushBackHandler).not.toHaveBeenCalled();

    const first = stack.register({ container: a.container });
    const second = stack.register({ container: b.container });
    expect(back.pushBackHandler).toHaveBeenCalledTimes(1);
    expect(back.handlers).toHaveLength(1);

    second.release();
    expect(back.handlers).toHaveLength(1);
    first.release();
    expect(back.handlers).toHaveLength(0);
  });

  test("the pushed handler closes the top surface and consumes the press", () => {
    const back = backSource();
    stack.dispose();
    stack = createSurfaceStack({ back });
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const lower = vi.fn();
    const upper = vi.fn();
    stack.register({ container: a.container, onDismiss: lower });
    stack.register({ container: b.container, onDismiss: upper });

    expect(back.handlers[0]?.()).toBe(true);
    expect(upper).toHaveBeenCalledWith("back");
    expect(lower).not.toHaveBeenCalled();
  });

  test("dispose removes the pushed handler", () => {
    const back = backSource();
    stack.dispose();
    stack = createSurfaceStack({ back });
    const { container } = surfaceWith("a");
    stack.register({ container });
    stack.dispose();
    expect(back.handlers).toHaveLength(0);
  });
});

describe("focus", () => {
  test("moves into the surface on open: the data-autofocus element, else the first tabbable, else the container", () => {
    opener();
    const withMarker = surfaceWith("one", "two");
    withMarker.buttons[1]?.setAttribute("data-autofocus", "");
    const marker = stack.register({ container: withMarker.container });
    expect(document.activeElement).toBe(withMarker.buttons[1]);
    marker.release();

    const plain = surfaceWith("one", "two");
    const first = stack.register({ container: plain.container });
    expect(document.activeElement).toBe(plain.buttons[0]);
    first.release();

    const empty = document.createElement("div");
    document.body.append(empty);
    const none = stack.register({ container: empty });
    expect(document.activeElement).toBe(empty);
    expect(empty.tabIndex).toBe(-1);
    none.release();
    expect(empty.hasAttribute("tabindex")).toBe(false);
  });

  test("an initialFocus inside the surface wins; one outside it or inert is ignored", () => {
    const { container, buttons } = surfaceWith("one", "two");
    const outside = opener("outside");
    const chosen = stack.register({ container, initialFocus: () => buttons[1] });
    expect(document.activeElement).toBe(buttons[1]);
    chosen.release();

    const ignored = stack.register({ container, initialFocus: () => outside });
    expect(document.activeElement).toBe(buttons[0]);
    ignored.release();

    const absent = stack.register({ container, initialFocus: () => null });
    expect(document.activeElement).toBe(buttons[0]);
    absent.release();
  });

  test("leaves a container's own tabindex alone", () => {
    const { container } = surfaceWith("a");
    container.tabIndex = 0;
    const handle = stack.register({ container });
    expect(container.tabIndex).toBe(0);
    handle.release();
    expect(container.getAttribute("tabindex")).toBe("0");
  });

  test("returns focus to the opener on release", () => {
    const trigger = opener();
    const { container, buttons } = surfaceWith("a");
    const handle = stack.register({ container });
    expect(document.activeElement).toBe(buttons[0]);
    handle.release();
    expect(document.activeElement).toBe(trigger);
  });

  test("an explicit opener, including null, replaces the focused element", () => {
    opener("focused");
    const other = document.createElement("button");
    document.body.append(other);
    const a = surfaceWith("a");
    const explicit = stack.register({ container: a.container, opener: other });
    explicit.release();
    expect(document.activeElement).toBe(other);

    const trigger = opener("again");
    const none = stack.register({ container: a.container, opener: null });
    none.release();
    expect(document.activeElement).not.toBe(trigger);
  });

  test("returnFocus overrides the opener and is resolved at release time", () => {
    opener();
    const replacement = document.createElement("button");
    document.body.append(replacement);
    const { container } = surfaceWith("a");
    let target: HTMLElement | undefined;
    const handle = stack.register({ container, returnFocus: () => target });
    target = replacement;
    handle.release();
    expect(document.activeElement).toBe(replacement);
  });

  test("a returnFocus that resolves to nothing falls back to the opener", () => {
    const trigger = opener();
    const { container } = surfaceWith("a");
    const handle = stack.register({ container, returnFocus: () => undefined });
    handle.release();
    expect(document.activeElement).toBe(trigger);
  });

  test("does not treat the body as an opener", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const { container } = surfaceWith("a");
    const handle = stack.register({ container });
    container.remove();
    handle.release();
    expect(document.activeElement).toBe(document.body);
  });

  test("when the opener is gone, focus falls back to the surface beneath", () => {
    const trigger = opener();
    const lower = surfaceWith("lower");
    const upper = surfaceWith("upper");
    const first = stack.register({ container: lower.container });
    const second = stack.register({ container: upper.container });
    expect(document.activeElement).toBe(upper.buttons[0]);
    upper.buttons[0]?.remove();
    // The second surface's opener was the lower surface's button.
    lower.buttons[0]?.remove();
    const replacement = document.createElement("button");
    lower.container.append(replacement);
    second.release();
    expect(document.activeElement).toBe(replacement);
    first.release();
    expect(document.activeElement).toBe(trigger);
  });

  test("when the opener is gone and nothing is beneath, focus is left alone", () => {
    const trigger = opener();
    const { container } = surfaceWith("a");
    const handle = stack.register({ container });
    trigger.remove();
    container.remove();
    handle.release();
    expect(document.activeElement).toBe(document.body);
  });

  test("returning to an opener inside an inert region falls back instead", () => {
    const trigger = opener();
    const region = document.createElement("div");
    region.setAttribute("inert", "");
    region.append(trigger);
    document.body.append(region);
    const { container } = surfaceWith("a");
    const handle = stack.register({ container, opener: trigger });
    handle.release();
    expect(document.activeElement).not.toBe(trigger);
  });

  test("releasing a covered surface does not take focus from the top", () => {
    opener();
    const lower = surfaceWith("lower");
    const upper = surfaceWith("upper");
    const first = stack.register({ container: lower.container });
    stack.register({ container: upper.container });
    first.release();
    expect(document.activeElement).toBe(upper.buttons[0]);
  });

  test("captureOpener reports the focused element, and null for the body", () => {
    expect(stack.captureOpener()).toBeNull();
    const trigger = opener();
    expect(stack.captureOpener()).toBe(trigger);
    trigger.blur();
    expect(stack.captureOpener()).toBeNull();
  });

  test("closing the outer surface before the one nested in it still returns focus to the outermost opener", () => {
    const trigger = opener("outermost");
    const outer = surfaceWith("outer control");
    const innerContainer = document.createElement("div");
    const innerButton = document.createElement("button");
    innerContainer.append(innerButton);
    outer.container.append(innerContainer);
    const first = stack.register({ container: outer.container });
    // The inner surface was opened from the outer one's control.
    const second = stack.register({ container: innerContainer, opener: outer.buttons[0] });
    // A parent's effects are cleaned up before its child's, and its DOM goes after.
    first.release();
    outer.container.remove();
    second.release();
    expect(document.activeElement).toBe(trigger);
  });

  test("a returnFocus that fails for the released surface falls to what it inherited, then to the surface beneath", () => {
    const trigger = opener("outermost");
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const c = surfaceWith("c");
    const first = stack.register({ container: a.container });
    const second = stack.register({ container: b.container, opener: a.buttons[0] });
    const third = stack.register({ container: c.container, opener: b.buttons[0] });
    second.release();
    first.release();
    a.container.remove();
    b.container.remove();
    third.release();
    expect(document.activeElement).toBe(trigger);
  });

  test("a child that took focus itself keeps it; a data-autofocus or initialFocus still wins over it", () => {
    opener();
    const { container, buttons } = surfaceWith("first", "second");
    container.tabIndex = -1;
    buttons[1]?.focus();
    const handle = stack.register({ container });
    expect(document.activeElement).toBe(buttons[1]);
    handle.release();

    container.focus();
    const onContainer = stack.register({ container });
    expect(document.activeElement).toBe(buttons[0]);
    onContainer.release();

    buttons[1]?.focus();
    buttons[0]?.setAttribute("data-autofocus", "");
    const marked = stack.register({ container });
    expect(document.activeElement).toBe(buttons[0]);
    marked.release();
  });

  test("tab stops count one radio per group", async () => {
    const user = userEvent.setup();
    const container = document.createElement("div");
    container.innerHTML = `
      <button id="start">start</button>
      <input type="radio" name="g" id="r1" />
      <input type="radio" name="g" id="r2" checked />
      <input type="radio" name="g" id="r3" />
      <input type="radio" name="h" id="h1" />
      <input type="radio" name="h" id="h2" />
      <form><input type="radio" name="g" id="f1" /><input type="radio" name="g" id="f2" /></form>`;
    document.body.append(container);
    stack.register({ container });
    // Stops: start, r2 (the checked one), h1 (none checked: the first), f1 (its
    // own form's group). The last is f1, and the one before it h1, not r3 or h2.
    document.getElementById("f1")?.focus();
    await user.tab();
    expect(document.activeElement?.id).toBe("start");
    await user.tab({ shift: true });
    expect(document.activeElement?.id).toBe("f1");
    // A checked radio that follows an unchecked one in its group is its stop.
    container.innerHTML = `<button id="s">s</button><input type="radio" name="g" id="a" /><input type="radio" name="g" id="b" checked />`;
    document.getElementById("b")?.focus();
    await user.tab();
    expect(document.activeElement?.id).toBe("s");
  });

  test("an open shadow root inside the surface does not make focus inside it look outside", () => {
    const container = document.createElement("div");
    const host = document.createElement("div");
    container.append(host);
    document.body.append(container);
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);
    const outside = opener("outside");
    stack.register({ container });
    inner.focus();
    expect(shadow.activeElement).toBe(inner);
    expect(document.activeElement).not.toBe(outside);
  });

  test("two stacks pulling focus back do not recurse without end", () => {
    const other = createSurfaceStack();
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    stack.register({ container: a.container });
    other.register({ container: b.container });
    expect(() => b.buttons[0]?.focus()).not.toThrow();
    other.dispose();
  });

  test("a surface that holds one already open sits beneath it, whichever registers first", () => {
    opener();
    const outer = surfaceWith("outer control");
    const innerContainer = document.createElement("div");
    const innerButton = document.createElement("button");
    innerContainer.append(innerButton);
    outer.container.append(innerContainer);
    const onOuter = vi.fn();
    const onInner = vi.fn();

    // A nested child's effects run before its parent's.
    const inner = stack.register({ container: innerContainer, onDismiss: onInner });
    const first = stack.register({ container: outer.container, onDismiss: onOuter });
    expect(inner.getLayer()).toBe(1);
    expect(first.getLayer()).toBe(0);
    expect(document.activeElement).toBe(innerButton);

    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(onInner).toHaveBeenCalledWith("escape");
    expect(onOuter).not.toHaveBeenCalled();
    expect(stack.getSnapshot().depth).toBe(2);
    inner.release();
    expect(first.getLayer()).toBe(0);
    first.release();
    expect(first.getLayer()).toBe(-1);
  });

  test("unrelated surfaces stack in the order they register", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const first = stack.register({ container: a.container });
    const second = stack.register({ container: b.container });
    expect([first.getLayer(), second.getLayer()]).toEqual([0, 1]);
  });

  test("an initial focus target that cannot take focus falls through to the next candidate", () => {
    const trigger = opener();
    const { container, buttons } = surfaceWith("disabled marked", "second", "third");
    (buttons[0] as HTMLButtonElement).disabled = true;
    buttons[0]?.setAttribute("data-autofocus", "");
    buttons[1]?.setAttribute("data-autofocus", "");
    const handle = stack.register({ container, initialFocus: () => buttons[0] });
    expect(document.activeElement).toBe(buttons[1]);
    handle.release();
    expect(document.activeElement).toBe(trigger);

    buttons[1]?.removeAttribute("data-autofocus");
    buttons[0]?.removeAttribute("data-autofocus");
    const plain = stack.register({ container, initialFocus: () => buttons[0] });
    expect(document.activeElement).toBe(buttons[1]);
    plain.release();
  });

  test("an opener that cannot take focus falls through to the surface beneath", () => {
    opener();
    const lower = surfaceWith("lower");
    const upper = surfaceWith("upper");
    const first = stack.register({ container: lower.container });
    const second = stack.register({ container: upper.container, opener: lower.buttons[0] });
    (lower.buttons[0] as HTMLButtonElement).disabled = true;
    second.release();
    expect(document.activeElement).toBe(lower.container);
    first.release();
  });

  test("a registration whose initialFocus throws is rolled back completely", () => {
    const back = backSource();
    stack.dispose();
    stack = createSurfaceStack({ back });
    const host = vi.fn();
    window.addEventListener("keydown", host);
    const { container } = surfaceWith("a");
    expect(() =>
      stack.register({
        container,
        initialFocus: () => {
          throw new Error("no focus");
        },
      })
    ).toThrow("no focus");
    expect(stack.getSnapshot().depth).toBe(0);
    expect(back.handlers).toHaveLength(0);
    expect(container.hasAttribute("tabindex")).toBe(false);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(host).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", host);
  });

  test("a failed nested registration leaves the surface beneath open", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    stack.register({ container: a.container });
    expect(() =>
      stack.register({
        container: b.container,
        initialFocus: () => {
          throw new Error("no focus");
        },
      })
    ).toThrow("no focus");
    expect(stack.getSnapshot().depth).toBe(1);
    expect(a.container.tabIndex).toBe(-1);
  });

  test("a subscriber that disposes the stack as a surface beneath another is released does not break release", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const first = stack.register({ container: a.container });
    stack.register({ container: b.container });
    stack.subscribe(() => stack.dispose());
    expect(() => first.release()).not.toThrow();
  });

  test("a handle released after dispose does nothing and leaves other surfaces alone", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    const stale = stack.register({ container: a.container });
    stack.dispose();
    stack.register({ container: b.container });
    stale.release();
    expect(stack.getSnapshot().depth).toBe(1);
  });

  test("release is idempotent", () => {
    const trigger = opener();
    const { container } = surfaceWith("a");
    const handle = stack.register({ container });
    handle.release();
    trigger.blur();
    handle.release();
    expect(stack.getSnapshot().depth).toBe(0);
    expect(document.activeElement).not.toBe(trigger);
  });
});

describe("focus trap", () => {
  test("Tab and Shift+Tab wrap inside the top surface", async () => {
    const user = userEvent.setup();
    const outside = opener("outside");
    const { container, buttons } = surfaceWith("one", "two", "three");
    stack.register({ container });
    expect(document.activeElement).toBe(buttons[0]);

    await user.tab();
    expect(document.activeElement).toBe(buttons[1]);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(buttons[2]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(buttons[1]);
    expect(document.activeElement).not.toBe(outside);
  });

  test("Shift+Tab from the container itself goes to the last tabbable", async () => {
    const user = userEvent.setup();
    const { container, buttons } = surfaceWith("one", "two");
    stack.register({ container });
    container.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(buttons[1]);
  });

  test("Tab with focus outside lands on the first, Shift+Tab on the last", async () => {
    const user = userEvent.setup();
    const { container, buttons } = surfaceWith("one", "two");
    stack.register({ container });
    (document.activeElement as HTMLElement).blur();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    (document.activeElement as HTMLElement).blur();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(buttons[1]);
  });

  test("with nothing tabbable, Tab keeps focus on the container", async () => {
    const user = userEvent.setup();
    const container = document.createElement("div");
    document.body.append(container);
    stack.register({ container });
    await user.tab();
    expect(document.activeElement).toBe(container);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(container);
  });

  test("skips disabled, hidden, negative-tabindex and inert controls", async () => {
    const user = userEvent.setup();
    const container = document.createElement("div");
    container.innerHTML = `
      <button id="a">a</button>
      <button disabled>b</button>
      <input type="hidden" />
      <button tabindex="-1">c</button>
      <div hidden><button>d</button></div>
      <div inert><button>e</button></div>
      <button id="f">f</button>`;
    document.body.append(container);
    stack.register({ container });
    // The wrap points are the first and last control a person can actually
    // reach: "f" is last although markup for four unreachable controls follows
    // "a", and "a" is first although the container precedes it.
    expect(document.activeElement?.id).toBe("a");
    document.getElementById("f")?.focus();
    await user.tab();
    expect(document.activeElement?.id).toBe("a");
    await user.tab({ shift: true });
    expect(document.activeElement?.id).toBe("f");
  });

  test("uses checkVisibility where the engine has it", async () => {
    const user = userEvent.setup();
    const container = document.createElement("div");
    container.innerHTML = `<button id="a">a</button><button id="b">b</button>`;
    document.body.append(container);
    const spy = vi.fn(function (this: HTMLElement) {
      return this.id !== "b";
    });
    Object.defineProperty(HTMLElement.prototype, "checkVisibility", {
      configurable: true,
      value: spy,
    });
    try {
      stack.register({ container });
      await user.tab();
      expect(document.activeElement?.id).toBe("a");
      expect(spy).toHaveBeenCalledWith({ visibilityProperty: true });
    } finally {
      delete (HTMLElement.prototype as { checkVisibility?: unknown }).checkVisibility;
    }
  });

  test("pulls focus back when it lands outside the top surface", () => {
    const outside = opener("outside");
    const { container, buttons } = surfaceWith("one");
    stack.register({ container });
    outside.focus();
    expect(document.activeElement).toBe(buttons[0]);
  });

  test("a surface rendered inside the one beneath it traps focus and takes Escape first", async () => {
    const user = userEvent.setup();
    const lower = surfaceWith("lower one", "lower two");
    const upperContainer = document.createElement("div");
    const upperButton = document.createElement("button");
    upperContainer.append(upperButton);
    lower.container.append(upperContainer);
    const onLower = vi.fn();
    const onUpper = vi.fn();
    stack.register({ container: lower.container, onDismiss: onLower });
    stack.register({ container: upperContainer, onDismiss: onUpper });
    expect(document.activeElement).toBe(upperButton);

    await user.tab();
    expect(document.activeElement).toBe(upperButton);
    await user.keyboard("{Escape}");
    expect(onUpper).toHaveBeenCalledWith("escape");
    expect(onLower).not.toHaveBeenCalled();
  });

  test("dispose removes the tabindex it set and nothing else", () => {
    const lower = surfaceWith("lower");
    const upper = surfaceWith("upper");
    stack.register({ container: lower.container });
    stack.register({ container: upper.container });
    stack.dispose();
    expect(lower.container.hasAttribute("tabindex")).toBe(false);
    expect(upper.container.hasAttribute("tabindex")).toBe(false);
  });

  test("dispose leaves a container's own tabindex", () => {
    const { container } = surfaceWith("a");
    container.tabIndex = 0;
    stack.register({ container });
    stack.dispose();
    expect(container.getAttribute("tabindex")).toBe("0");
  });
});

describe("pointer lock", () => {
  let exit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exit = vi.fn();
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      value: document.body,
    });
    Object.defineProperty(document, "exitPointerLock", { configurable: true, value: exit });
  });

  afterEach(() => {
    delete (document as { pointerLockElement?: unknown }).pointerLockElement;
    delete (document as { exitPointerLock?: unknown }).exitPointerLock;
  });

  test("is released when the first surface opens, not for nested ones", () => {
    const a = surfaceWith("a");
    const b = surfaceWith("b");
    stack.register({ container: a.container });
    stack.register({ container: b.container });
    expect(exit).toHaveBeenCalledTimes(1);
  });

  test("can be left alone", () => {
    stack.dispose();
    stack = createSurfaceStack({ releasePointerLock: false });
    const { container } = surfaceWith("a");
    stack.register({ container });
    expect(exit).not.toHaveBeenCalled();
  });
});
