// These tests run in headless Chromium, where focus movement, key delivery and
// layout are the engine's own. jsdom cannot prove any of them: it has no real
// tab order, does not move focus on a click, and lays nothing out.
import { type ReactNode, StrictMode, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createSurfaceStack,
  Dialog,
  Drawer,
  Sheet,
  Surface,
  type SurfaceBackHandler,
  SurfaceClose,
  type SurfaceStack,
  SurfaceStackProvider,
} from "../../src/surfaces";

let host: HTMLElement;
let root: Root;
let stack: SurfaceStack;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  stack = createSurfaceStack();
});

afterEach(() => {
  root.unmount();
  stack.dispose();
  host.remove();
  document.documentElement.removeAttribute("style");
});

function mount(node: ReactNode, within: SurfaceStack = stack) {
  flushSync(() => {
    root.render(<SurfaceStackProvider stack={within}>{node}</SurfaceStackProvider>);
  });
}

function focused() {
  return (document.activeElement as HTMLElement | null)?.textContent ?? "";
}

function byText(text: string) {
  const match = [...document.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!match) throw new Error(`no button "${text}"`);
  return match;
}

function Toggle({
  children,
  label = "opener",
  dismissible = true,
}: {
  children: ReactNode;
  label?: string;
  dismissible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">before</button>
      <button type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      <button type="button">after</button>
      <Dialog aria-label="d" open={open} onDismiss={dismissible ? () => setOpen(false) : undefined}>
        {children}
      </Dialog>
    </>
  );
}

describe("focus trap", () => {
  test("Tab and Shift+Tab cycle inside the dialog and never reach the page behind", async () => {
    mount(
      <Toggle>
        <button type="button">one</button>
        <button disabled type="button">
          dead
        </button>
        <button style={{ display: "none" }} type="button">
          gone
        </button>
        <button type="button">two</button>
        <button type="button">three</button>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("one");

    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      await userEvent.keyboard("{Tab}");
      seen.push(focused());
    }
    expect(seen).toEqual(["two", "three", "one", "two", "three", "one", "two"]);

    const back: string[] = [];
    for (let i = 0; i < 5; i++) {
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      back.push(focused());
    }
    expect(back).toEqual(["one", "three", "two", "one", "three"]);
  });

  test("a radio group is one stop, so the wrap points are where Tab really lands", async () => {
    mount(
      <Toggle>
        <button type="button">start</button>
        <input aria-label="a" name="g" type="radio" />
        <input aria-label="b" defaultChecked name="g" type="radio" />
        <input aria-label="c" name="g" type="radio" />
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("start");
    const label = () => (document.activeElement as HTMLElement).getAttribute("aria-label");
    await userEvent.keyboard("{Tab}");
    expect(label()).toBe("b");
    await userEvent.keyboard("{Tab}");
    expect(focused()).toBe("start");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(label()).toBe("b");
  });

  test("a child that takes focus with autoFocus keeps it", async () => {
    mount(
      <Toggle>
        <button type="button">first</button>
        {/* biome-ignore lint/a11y/noAutofocus: the behaviour under test */}
        <button autoFocus type="button">
          chosen
        </button>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("chosen");
  });

  test("a dialog with nothing focusable keeps focus on itself", async () => {
    mount(
      <Toggle>
        <p>Only text</p>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    const panel = document.querySelector('[role="dialog"]');
    await expect.poll(() => document.activeElement).toBe(panel);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(panel);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(panel);
  });

  test("focus a script moves outside the dialog comes straight back", async () => {
    mount(
      <Toggle>
        <button type="button">inside</button>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("inside");
    byText("before").focus();
    expect(focused()).toBe("inside");
  });
});

describe("Escape and focus return", () => {
  test("Escape closes the dialog, the host never sees it, and focus returns to the opener", async () => {
    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    mount(
      <Toggle>
        <button type="button">inside</button>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("inside");

    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    expect(focused()).toBe("opener");
    expect(seen.mock.calls.filter(([event]) => event.key === "Escape")).toHaveLength(0);

    // With nothing open the same key reaches the host, which may pause on it.
    await userEvent.keyboard("{Escape}");
    expect(seen.mock.calls.filter(([event]) => event.key === "Escape")).toHaveLength(1);
    window.removeEventListener("keydown", seen);
  });

  test("a non-dismissible dialog survives repeated Escape and keeps it from the host", async () => {
    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    mount(
      <Toggle dismissible={false}>
        <button type="button">inside</button>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("inside");
    await userEvent.keyboard("{Escape}{Escape}");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(focused()).toBe("inside");
    expect(seen.mock.calls.filter(([event]) => event.key === "Escape")).toHaveLength(0);
    window.removeEventListener("keydown", seen);
  });

  test("focus returns to the opener when the dialog is closed from inside", async () => {
    mount(
      <Toggle>
        <SurfaceClose aria-label="Close">x</SurfaceClose>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("x");
    await userEvent.click(byText("x"));
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    expect(focused()).toBe("opener");
  });

  test("a press on the backdrop closes it; one on the panel does not", async () => {
    mount(
      <Toggle>
        <button type="button">inside</button>
      </Toggle>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("inside");
    const panel = document.querySelector('[role="dialog"]') as HTMLElement;
    await userEvent.click(panel);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await userEvent.click(panel.parentElement as HTMLElement, { position: { x: 3, y: 3 } });
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    expect(focused()).toBe("opener");
  });
});

describe("nesting and the pause signal", () => {
  function Nested() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOuter(true)}>
          open outer
        </button>
        <Surface aria-label="outer" open={outer} placement="fill" onDismiss={() => setOuter(false)}>
          <button type="button" onClick={() => setInner(true)}>
            open inner
          </button>
        </Surface>
        <Sheet aria-label="inner" open={inner} onDismiss={() => setInner(false)}>
          <button type="button">inner control</button>
        </Sheet>
      </>
    );
  }

  test("Escape closes the detail, then the surface, returning focus each time; the host sees one pause", async () => {
    const edges: boolean[] = [];
    stack.onPausingChange((pausing) => edges.push(pausing));
    mount(<Nested />);

    await userEvent.click(byText("open outer"));
    await expect.poll(focused).toBe("open inner");
    await userEvent.click(byText("open inner"));
    await expect.poll(focused).toBe("inner control");

    // The surface beneath is not reachable by keyboard.
    await userEvent.keyboard("{Tab}");
    expect(focused()).toBe("inner control");

    await userEvent.keyboard("{Escape}");
    await expect.poll(focused).toBe("open inner");
    await userEvent.keyboard("{Escape}");
    await expect.poll(focused).toBe("open outer");
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await expect.poll(() => edges).toEqual([true, false]);
  });

  test("pointer lock is released when the first surface opens", async () => {
    const exit = vi.fn();
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "pointerLockElement");
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: host });
    Object.defineProperty(document, "exitPointerLock", { configurable: true, value: exit });
    try {
      mount(<Nested />);
      await userEvent.click(byText("open outer"));
      await expect.poll(() => exit.mock.calls.length).toBe(1);
    } finally {
      delete (document as { pointerLockElement?: unknown }).pointerLockElement;
      delete (document as { exitPointerLock?: unknown }).exitPointerLock;
      expect(original).toBeDefined();
    }
  });
});

describe("back", () => {
  test("a back press closes the top surface and is consumed while any is open", async () => {
    const handlers: SurfaceBackHandler[] = [];
    const own = createSurfaceStack({
      back: {
        pushBackHandler(handler) {
          handlers.push(handler);
          return () => handlers.splice(handlers.indexOf(handler), 1);
        },
      },
    });
    mount(
      <Toggle>
        <button type="button">inside</button>
      </Toggle>,
      own
    );
    expect(handlers).toHaveLength(0);
    await userEvent.click(byText("opener"));
    await expect.poll(() => handlers.length).toBe(1);

    expect(handlers[0]?.()).toBe(true);
    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    expect(handlers).toHaveLength(0);
    expect(focused()).toBe("opener");
    own.dispose();
  });
});

describe("React StrictMode", () => {
  test("opens and closes once as far as the host can tell, with focus handled", async () => {
    const edges: boolean[] = [];
    stack.onPausingChange((pausing) => edges.push(pausing));
    mount(
      <StrictMode>
        <Toggle>
          <button type="button">inside</button>
        </Toggle>
      </StrictMode>
    );
    await userEvent.click(byText("opener"));
    await expect.poll(focused).toBe("inside");
    await userEvent.keyboard("{Escape}");
    await expect.poll(focused).toBe("opener");
    await expect.poll(() => edges).toEqual([true, false]);
  });
});

describe("layout", () => {
  function box(selector: string) {
    return (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
  }

  test("every placement is docked where its name says, and the backdrop covers the frame", async () => {
    mount(
      <>
        <Dialog aria-label="center" data-testid="center" open>
          <button type="button" style={{ width: 100, height: 60 }}>
            c
          </button>
        </Dialog>
        <Drawer aria-label="drawer" data-testid="drawer" open style={{ width: 200 }}>
          <button type="button">d</button>
        </Drawer>
        <Sheet aria-label="sheet" data-testid="sheet" open style={{ height: 120 }}>
          <button type="button">s</button>
        </Sheet>
        <Surface aria-label="fill" data-testid="fill" open placement="fill">
          <button type="button">f</button>
        </Surface>
      </>
    );
    await expect.poll(() => document.querySelectorAll('[role="dialog"]').length).toBe(4);
    const w = window.innerWidth;
    const h = window.innerHeight;

    const backdrop = box('[data-surface-backdrop][data-placement="fill"]');
    expect(backdrop).toMatchObject({ left: 0, top: 0, width: w, height: h });

    const center = box('[data-surface="dialog"]');
    expect(Math.abs(center.left + center.width / 2 - w / 2)).toBeLessThan(1);
    expect(Math.abs(center.top + center.height / 2 - h / 2)).toBeLessThan(1);

    expect(box('[data-surface="drawer"]')).toMatchObject({
      right: w,
      top: 0,
      height: h,
      width: 200,
    });
    expect(box('[data-surface="sheet"]')).toMatchObject({
      left: 0,
      bottom: h,
      width: w,
      height: 120,
    });
    expect(box('[data-surface="surface"]')).toMatchObject({ left: 0, top: 0, width: w, height: h });
  });

  test("the host moves a surface off the safe area with its custom properties", async () => {
    document.documentElement.style.setProperty("--surface-inset-bottom", "24px");
    document.documentElement.style.setProperty("--surface-inset-right", "16px");
    mount(
      <>
        <Sheet aria-label="sheet" open style={{ height: 80 }}>
          <button type="button">s</button>
        </Sheet>
        <Drawer aria-label="drawer" open style={{ width: 80 }}>
          <button type="button">d</button>
        </Drawer>
      </>
    );
    await expect.poll(() => document.querySelectorAll('[role="dialog"]').length).toBe(2);
    expect(box('[data-surface="sheet"]').bottom).toBe(window.innerHeight - 24);
    expect(box('[data-surface="drawer"]').right).toBe(window.innerWidth - 16);
  });

  test("targets are 48px, and 64px when the host raises one property", async () => {
    mount(
      <Dialog aria-label="d" open>
        <SurfaceClose aria-label="Close" data-testid="close" />
      </Dialog>
    );
    await expect.poll(() => document.querySelector("[data-surface-close]")).not.toBeNull();
    const close = () => box("[data-surface-close]");
    expect(close().width).toBeGreaterThanOrEqual(48);
    expect(close().height).toBeGreaterThanOrEqual(48);
    expect(close().width).toBeLessThan(64);

    document.documentElement.style.setProperty("--surface-target", "64px");
    expect(close().width).toBeGreaterThanOrEqual(64);
    expect(close().height).toBeGreaterThanOrEqual(64);
  });

  test("the primitives animate nothing of their own", async () => {
    mount(
      <Drawer aria-label="d" open>
        <button type="button">d</button>
      </Drawer>
    );
    await expect.poll(() => document.querySelector('[role="dialog"]')).not.toBeNull();
    for (const selector of ["[data-surface-backdrop]", '[role="dialog"]']) {
      const style = getComputedStyle(document.querySelector(selector) as HTMLElement);
      expect(style.animationName).toBe("none");
      expect(style.transitionDuration).toBe("0s");
    }
  });
});
