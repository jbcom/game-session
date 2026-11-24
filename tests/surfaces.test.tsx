// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSurfaceStack,
  Dialog,
  Drawer,
  getDefaultSurfaceStack,
  Sheet,
  Surface,
  SurfaceClose,
  type SurfaceStack,
  SurfaceStackProvider,
  useSurfaceSnapshot,
  useSurfaceStack,
} from "../src/surfaces";
import * as ui from "../src/ui";

let stacks: SurfaceStack[] = [];

function freshStack() {
  const stack = createSurfaceStack();
  stacks.push(stack);
  return stack;
}

afterEach(() => {
  cleanup();
  for (const stack of stacks) stack.dispose();
  stacks = [];
  getDefaultSurfaceStack().dispose();
});

describe("Dialog", () => {
  test("renders nothing while closed", () => {
    const { container } = render(<Dialog aria-label="Closed" open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders a labelled modal panel inside a backdrop, with only the host's children", () => {
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <Dialog aria-label="Named by text" open>
          <p>Host content</p>
        </Dialog>
      </SurfaceStackProvider>
    );
    const panel = screen.getByRole("dialog", { name: "Named by text" });
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute("data-surface", "dialog");
    expect(panel).toHaveAttribute("data-placement", "center");
    expect(panel).toHaveTextContent(/^Host content$/);
    expect(panel.parentElement).toHaveAttribute("data-surface-backdrop", "");
    expect(panel.parentElement).toHaveAttribute("data-placement", "center");
  });

  test("can be named by another element and be an alertdialog", () => {
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <Dialog aria-labelledby="heading" open role="alertdialog">
          <h2 id="heading">Named by heading</h2>
        </Dialog>
      </SurfaceStackProvider>
    );
    expect(screen.getByRole("alertdialog", { name: "Named by heading" })).toBeInTheDocument();
  });

  test("passes host attributes through and merges structural style under the host's", () => {
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <Dialog
          aria-label="Styled"
          backdropClassName="backdrop-class"
          backdropStyle={{ zIndex: 7 }}
          className="panel-class"
          data-testid="panel"
          id="panel-id"
          open
          style={{ overflow: "hidden" }}
        />
      </SurfaceStackProvider>
    );
    const panel = screen.getByTestId("panel");
    expect(panel).toHaveClass("panel-class");
    expect(panel).toHaveAttribute("id", "panel-id");
    expect(panel).toHaveStyle({ overflow: "hidden", maxWidth: "100%" });
    const backdrop = panel.parentElement as HTMLElement;
    expect(backdrop).toHaveClass("backdrop-class");
    expect(backdrop).toHaveStyle({ position: "fixed", zIndex: "7", display: "flex" });
    expect(backdrop.style.paddingTop).toContain("--surface-inset-top");
  });
});

describe("placements", () => {
  test.each([
    ["Drawer", <Drawer aria-label="d" key="d" open />, "drawer", "right"],
    ["Drawer left", <Drawer aria-label="d" key="dl" open side="left" />, "drawer", "left"],
    ["Sheet", <Sheet aria-label="s" key="s" open />, "sheet", "bottom"],
    ["Sheet top", <Sheet aria-label="s" key="st" open side="top" />, "sheet", "top"],
    ["Sheet right", <Sheet aria-label="s" key="sr" open side="right" />, "sheet", "right"],
    ["Surface fill", <Surface aria-label="f" key="f" open placement="fill" />, "surface", "fill"],
    ["Surface left", <Surface aria-label="f" key="fl" open placement="left" />, "surface", "left"],
  ])("%s", (_name, element, kind, placement) => {
    render(<SurfaceStackProvider stack={freshStack()}>{element}</SurfaceStackProvider>);
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("data-surface", kind);
    expect(panel).toHaveAttribute("data-placement", placement);
  });

  test("an edge sheet takes the full width of its edge, and fill takes the frame", () => {
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <Sheet aria-label="s" data-testid="sheet" open />
        <Surface aria-label="f" data-testid="fill" open placement="fill" />
      </SurfaceStackProvider>
    );
    expect(screen.getByTestId("sheet")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("fill")).toHaveStyle({ width: "100%", height: "100%" });
  });
});

describe("focus", () => {
  test("moves into the surface on open and returns to the opener on close", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <SurfaceStackProvider stack={stack}>
          <button type="button" onClick={() => setOpen(true)}>
            opener
          </button>
          <Dialog aria-label="d" open={open} onDismiss={() => setOpen(false)}>
            <button type="button">first</button>
            <button type="button">second</button>
          </Dialog>
        </SurfaceStackProvider>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "opener" });
    await user.click(opener);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  test("remembers the opener even when a child takes focus with autoFocus", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <SurfaceStackProvider stack={stack}>
          <button type="button" onClick={() => setOpen(true)}>
            opener
          </button>
          <Dialog aria-label="d" open={open} onDismiss={() => setOpen(false)}>
            {/* biome-ignore lint/a11y/noAutofocus: proves the opener survives a child's autoFocus */}
            <button autoFocus type="button">
              child
            </button>
          </Dialog>
        </SurfaceStackProvider>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "opener" });
    await user.click(opener);
    expect(screen.getByRole("button", { name: "child" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });

  test("initialFocus takes a ref or a function, and data-autofocus is the default", () => {
    const stack = freshStack();
    const ref = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" initialFocus={ref} open>
          <button type="button">one</button>
          <button ref={ref} type="button">
            two
          </button>
        </Dialog>
      </SurfaceStackProvider>
    );
    expect(screen.getByRole("button", { name: "two" })).toHaveFocus();

    rerender(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open={false} />
      </SurfaceStackProvider>
    );
    rerender(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" initialFocus={() => document.getElementById("by-function")} open>
          <button type="button">one</button>
          <button id="by-function" type="button">
            two
          </button>
        </Dialog>
      </SurfaceStackProvider>
    );
    expect(screen.getByRole("button", { name: "two" })).toHaveFocus();

    rerender(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open={false} />
      </SurfaceStackProvider>
    );
    rerender(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open>
          <button type="button">one</button>
          <button data-autofocus="" type="button">
            two
          </button>
        </Dialog>
      </SurfaceStackProvider>
    );
    expect(screen.getByRole("button", { name: "two" })).toHaveFocus();
  });

  test("returnFocus overrides the opener, as a ref or a function", () => {
    const stack = freshStack();
    const target = createRef<HTMLButtonElement>();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = (open: boolean, returnFocus: Parameters<typeof Dialog>[0]["returnFocus"]) => (
      <SurfaceStackProvider stack={stack}>
        <button ref={target} type="button">
          target
        </button>
        <Dialog aria-label="d" open={open} returnFocus={returnFocus}>
          <button type="button">inside</button>
        </Dialog>
      </SurfaceStackProvider>
    );
    const { rerender } = render(view(true, target));
    rerender(view(false, target));
    expect(screen.getByRole("button", { name: "target" })).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    opener.focus();
    rerender(view(true, () => document.getElementById("elsewhere")));
    const elsewhere = document.createElement("button");
    elsewhere.id = "elsewhere";
    document.body.append(elsewhere);
    rerender(view(false, () => elsewhere));
    expect(elsewhere).toHaveFocus();
    opener.remove();
    elsewhere.remove();
  });

  test("closing by unmount returns focus too", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    function Host({ shown }: { shown: boolean }) {
      return (
        <SurfaceStackProvider stack={stack}>
          <button type="button">opener</button>
          {shown ? (
            <Dialog aria-label="d" open>
              <button type="button">inside</button>
            </Dialog>
          ) : null}
        </SurfaceStackProvider>
      );
    }
    const { rerender } = render(<Host shown={false} />);
    await user.click(screen.getByRole("button", { name: "opener" }));
    rerender(<Host shown />);
    expect(screen.getByRole("button", { name: "inside" })).toHaveFocus();
    rerender(<Host shown={false} />);
    expect(screen.getByRole("button", { name: "opener" })).toHaveFocus();
  });
});

describe("dismissing", () => {
  test("Escape reports 'escape' and a non-dismissible dialog swallows it", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    const host = vi.fn();
    window.addEventListener("keydown", host);
    const onDismiss = vi.fn();
    const { rerender } = render(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open onDismiss={onDismiss}>
          <button type="button">inside</button>
        </Dialog>
      </SurfaceStackProvider>
    );
    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("escape");
    expect(host).not.toHaveBeenCalled();

    rerender(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open>
          <button type="button">inside</button>
        </Dialog>
      </SurfaceStackProvider>
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(host).not.toHaveBeenCalled();
    window.removeEventListener("keydown", host);
  });

  test("back reaches the top surface through the stack", () => {
    const stack = freshStack();
    const onDismiss = vi.fn();
    render(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open onDismiss={onDismiss} />
      </SurfaceStackProvider>
    );
    expect(stack.dismiss("back")).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith("back");
  });

  test("always calls the latest onDismiss", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open onDismiss={first} />
      </SurfaceStackProvider>
    );
    rerender(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="d" open onDismiss={second} />
      </SurfaceStackProvider>
    );
    await user.keyboard("{Escape}");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  test("a press on the backdrop reports 'backdrop'; one that starts in the panel does not", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <Dialog aria-label="d" data-testid="panel" open onDismiss={onDismiss}>
          <button type="button">inside</button>
        </Dialog>
      </SurfaceStackProvider>
    );
    const panel = screen.getByTestId("panel");
    const backdrop = panel.parentElement as HTMLElement;

    await user.click(panel);
    expect(onDismiss).not.toHaveBeenCalled();

    await user.pointer([
      { keys: "[MouseLeft>]", target: panel },
      { target: backdrop },
      { keys: "[/MouseLeft]" },
    ]);
    expect(onDismiss).not.toHaveBeenCalled();

    // Pressed on the backdrop and released on the panel: the click lands on
    // their common ancestor, the backdrop, but it is not a backdrop press.
    await user.pointer([
      { keys: "[MouseLeft>]", target: backdrop },
      { target: panel },
      { keys: "[/MouseLeft]" },
    ]);
    expect(onDismiss).not.toHaveBeenCalled();

    // A cancelled press (a touch that became a scroll) leaves nothing armed.
    fireEvent.pointerDown(backdrop);
    fireEvent.pointerCancel(backdrop);
    fireEvent.click(backdrop);
    expect(onDismiss).not.toHaveBeenCalled();

    // A press still armed when a click arrives from inside the panel is not a backdrop press.
    fireEvent.pointerDown(backdrop);
    fireEvent.click(screen.getByRole("button", { name: "inside" }));
    expect(onDismiss).not.toHaveBeenCalled();

    await user.click(backdrop);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("backdrop");

    // A bare click with no press before it (an assistive technology) closes nothing.
    backdrop.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("SurfaceClose reports 'close', honours preventDefault, and is inert outside a surface", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <SurfaceClose aria-label="Outside" />
        <Dialog aria-label="d" open onDismiss={onDismiss}>
          <SurfaceClose aria-label="Close one" />
          <SurfaceClose aria-label="Close two" onClick={onClick} style={{ minWidth: "100px" }} />
        </Dialog>
      </SurfaceStackProvider>
    );
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(onDismiss).not.toHaveBeenCalled();

    const close = screen.getByRole("button", { name: "Close one" });
    expect(close).toHaveAttribute("type", "button");
    expect(close).toHaveAttribute("data-surface-close", "");
    expect(close.style.minHeight).toBe("var(--surface-target, 48px)");
    await user.click(close);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("close");

    await user.click(screen.getByRole("button", { name: "Close two" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Close two" })).toHaveStyle({ minWidth: "100px" });
  });
});

describe("the pause signal", () => {
  test("useSurfaceSnapshot follows open surfaces, and pauses can be switched off live", () => {
    const stack = freshStack();
    function Readout() {
      const { depth, pausing } = useSurfaceSnapshot();
      return <output>{`${depth}:${pausing}`}</output>;
    }
    const view = (pauses: boolean) => (
      <SurfaceStackProvider stack={stack}>
        <Readout />
        <Dialog aria-label="d" open pauses={pauses} />
      </SurfaceStackProvider>
    );
    const { rerender } = render(view(true));
    expect(screen.getByRole("status")).toHaveTextContent("1:true");
    rerender(view(false));
    expect(screen.getByRole("status")).toHaveTextContent("1:false");
    rerender(view(true));
    expect(screen.getByRole("status")).toHaveTextContent("1:true");
  });

  test("a stack passed to the hook or the surface wins over the one in scope", () => {
    const own = freshStack();
    const scoped = freshStack();
    function Readout() {
      return <output>{String(useSurfaceSnapshot(own).depth)}</output>;
    }
    render(
      <SurfaceStackProvider stack={scoped}>
        <Readout />
        <Dialog aria-label="d" open stack={own} />
      </SurfaceStackProvider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("1");
    expect(own.getSnapshot().depth).toBe(1);
    expect(scoped.getSnapshot().depth).toBe(0);
  });

  test("without a provider, surfaces join the shared default stack", () => {
    function Probe() {
      const stack = useSurfaceStack();
      return <output>{String(stack === getDefaultSurfaceStack())}</output>;
    }
    render(
      <>
        <Probe />
        <Dialog aria-label="d" open />
      </>
    );
    expect(screen.getByRole("status")).toHaveTextContent("true");
    expect(getDefaultSurfaceStack().getSnapshot().depth).toBe(1);
    expect(getDefaultSurfaceStack()).toBe(getDefaultSurfaceStack());
  });

  test("the server snapshot is empty", () => {
    function Readout() {
      return <output>{String(useSurfaceSnapshot(freshStack()).depth)}</output>;
    }
    expect(renderToString(<Readout />)).toContain(">0<");
  });

  test("an open dialog renders on the server with no effects", () => {
    const html = renderToString(
      <Dialog aria-label="Server dialog" open>
        <p>Server content</p>
      </Dialog>
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Server content");
  });
});

describe("under StrictMode", () => {
  test("a surface opens once as far as the host can tell, and still returns focus", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    const changes = vi.fn();
    stack.onPausingChange(changes);
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <StrictMode>
          <SurfaceStackProvider stack={stack}>
            <button type="button" onClick={() => setOpen(true)}>
              opener
            </button>
            <Dialog aria-label="d" open={open} onDismiss={() => setOpen(false)}>
              <button type="button">inside</button>
            </Dialog>
          </SurfaceStackProvider>
        </StrictMode>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "opener" });
    await user.click(opener);
    await act(async () => {
      await Promise.resolve();
    });
    expect(changes.mock.calls).toEqual([[true]]);
    expect(stack.getSnapshot().depth).toBe(1);
    expect(screen.getByRole("button", { name: "inside" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await act(async () => {
      await Promise.resolve();
    });
    expect(changes.mock.calls).toEqual([[true], [false]]);
    expect(opener).toHaveFocus();
  });
});

describe("nesting", () => {
  test("a detail surface closes before the one beneath it, and the host sees one pause", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    const changes = vi.fn();
    stack.onPausingChange(changes);
    function Host() {
      const [outer, setOuter] = useState(false);
      const [inner, setInner] = useState(false);
      return (
        <SurfaceStackProvider stack={stack}>
          <button type="button" onClick={() => setOuter(true)}>
            open outer
          </button>
          <Surface
            aria-label="outer"
            open={outer}
            placement="fill"
            onDismiss={() => setOuter(false)}
          >
            <button type="button" onClick={() => setInner(true)}>
              open inner
            </button>
          </Surface>
          <Sheet aria-label="inner" open={inner} onDismiss={() => setInner(false)}>
            <button type="button">inner control</button>
          </Sheet>
        </SurfaceStackProvider>
      );
    }
    render(<Host />);
    const openOuter = screen.getByRole("button", { name: "open outer" });
    await user.click(openOuter);
    const openInner = screen.getByRole("button", { name: "open inner" });
    await user.click(openInner);
    expect(screen.getByRole("button", { name: "inner control" })).toHaveFocus();
    expect(stack.getSnapshot().depth).toBe(2);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "inner" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "outer" })).toBeInTheDocument();
    expect(openInner).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(openOuter).toHaveFocus();

    await act(async () => {
      await Promise.resolve();
    });
    expect(changes.mock.calls).toEqual([[true], [false]]);
  });
});

describe("stacking order", () => {
  test("a nested surface that is open on first render is still the top", async () => {
    const user = userEvent.setup();
    const stack = freshStack();
    const onOuter = vi.fn();
    const onInner = vi.fn();
    render(
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="outer" open onDismiss={onOuter}>
          <button type="button">outer control</button>
          <Sheet aria-label="inner" open onDismiss={onInner}>
            <button type="button">inner control</button>
          </Sheet>
        </Dialog>
      </SurfaceStackProvider>
    );
    expect(stack.getSnapshot().depth).toBe(2);
    expect(screen.getByRole("button", { name: "inner control" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onInner).toHaveBeenCalledWith("escape");
    expect(onOuter).not.toHaveBeenCalled();
  });

  test("surfaces paint in stack order, not document order", () => {
    const stack = freshStack();
    const view = (a: boolean) => (
      <SurfaceStackProvider stack={stack}>
        <Dialog aria-label="a" data-testid="a" open={a} />
        <Dialog aria-label="b" data-testid="b" open />
      </SurfaceStackProvider>
    );
    const { rerender } = render(view(false));
    expect(screen.getByTestId("b").parentElement?.style.zIndex).toBe(
      "calc(var(--surface-z, 1000) + 0)"
    );
    // `a` comes first in the document but opens second, so it is the top.
    rerender(view(true));
    expect(screen.getByTestId("a").parentElement?.style.zIndex).toBe(
      "calc(var(--surface-z, 1000) + 1)"
    );
    expect(screen.getByTestId("b").parentElement?.style.zIndex).toBe(
      "calc(var(--surface-z, 1000) + 0)"
    );
  });
});

describe("a press that ends under the finger", () => {
  afterEach(() => {
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  test("is a backdrop press only if what is under the release point is the backdrop", () => {
    const onDismiss = vi.fn();
    render(
      <SurfaceStackProvider stack={freshStack()}>
        <Dialog aria-label="d" data-testid="panel" open onDismiss={onDismiss} />
      </SurfaceStackProvider>
    );
    const panel = screen.getByTestId("panel");
    const backdrop = panel.parentElement as HTMLElement;
    let under: Element = panel;
    document.elementFromPoint = () => under;

    // A touch started outside the panel and captured there ends over the panel:
    // its target is still the backdrop, but it is not a backdrop press.
    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);
    expect(onDismiss).not.toHaveBeenCalled();

    under = backdrop;
    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("backdrop");
  });
});

describe("the ui entry", () => {
  test("re-exports the same primitives", () => {
    expect(ui.Dialog).toBe(Dialog);
    expect(ui.Drawer).toBe(Drawer);
    expect(ui.Sheet).toBe(Sheet);
    expect(ui.Surface).toBe(Surface);
    expect(ui.SurfaceClose).toBe(SurfaceClose);
    expect(ui.createSurfaceStack).toBe(createSurfaceStack);
  });
});
