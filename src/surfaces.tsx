import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  createContext,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  createSurfaceStack,
  type SurfaceDismissReason,
  type SurfaceHandle,
  type SurfaceStack,
} from "./surfaceStack.js";

export {
  bindSurfacePauseFlag,
  createSurfaceStack,
  type SurfaceBackHandler,
  type SurfaceBackSource,
  type SurfaceDismissReason,
  type SurfaceHandle,
  type SurfaceRegistration,
  type SurfaceSnapshot,
  type SurfaceStack,
  type SurfaceStackOptions,
} from "./surfaceStack.js";

/** Where a surface sits on screen. `fill` covers the whole frame. */
export type SurfacePlacement = "center" | "left" | "right" | "top" | "bottom" | "fill";

/** An element to focus, as a ref or a function that finds it when needed. */
export type SurfaceFocusTarget =
  | RefObject<HTMLElement | null>
  | (() => HTMLElement | null | undefined);

/** A surface must be named for assistive technology, by text or by another element. */
export type SurfaceLabel =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

/** Props shared by {@link Surface}, {@link Dialog}, {@link Drawer} and {@link Sheet}. */
export type SurfaceBaseProps = SurfaceLabel &
  Omit<
    ComponentPropsWithoutRef<"div">,
    "aria-label" | "aria-labelledby" | "aria-modal" | "children" | "role" | "tabIndex"
  > & {
    /** Whether the surface is shown. It renders nothing, and holds no focus, while `false`. */
    open: boolean;
    /**
     * Asked to close when Escape or back reaches this surface while it is on
     * top, when the backdrop is pressed, or when a {@link SurfaceClose} inside
     * it is. The host decides whether to close, by setting `open` to `false`.
     * Omit it for a surface that cannot be dismissed: Escape and back are
     * still consumed.
     */
    onDismiss?: (reason: SurfaceDismissReason) => void;
    /** Whether this surface counts toward the stack's pausing signal. Defaults to `true`. */
    pauses?: boolean;
    /** `"alertdialog"` for a surface that interrupts and asks for a response. Defaults to `"dialog"`. */
    role?: "dialog" | "alertdialog";
    /** What takes focus on open. Defaults to a `[data-autofocus]` descendant, then the first tabbable. */
    initialFocus?: SurfaceFocusTarget;
    /** Where focus goes on close. Defaults to whatever held focus when the surface opened. */
    returnFocus?: SurfaceFocusTarget;
    /** The stack to join. Defaults to the nearest {@link SurfaceStackProvider}'s, else the shared default. */
    stack?: SurfaceStack;
    /** A class for the full-frame layer behind the panel. */
    backdropClassName?: string;
    /** Inline style for the backdrop layer, applied over the structural layout. */
    backdropStyle?: CSSProperties;
    /** The surface's content. Only what the host passes is rendered. */
    children?: ReactNode;
  };

/** Props for {@link Surface}. */
export type SurfaceProps = SurfaceBaseProps & {
  /** Where the surface sits. */
  placement: SurfacePlacement;
};

/** Props for {@link Dialog}. */
export type DialogProps = SurfaceBaseProps;

/** Props for {@link Drawer}. */
export type DrawerProps = SurfaceBaseProps & {
  /** Which edge the drawer is attached to. Defaults to `"right"`. */
  side?: "left" | "right";
};

/** Props for {@link Sheet}. */
export type SheetProps = SurfaceBaseProps & {
  /** Which edge the sheet rises from. Defaults to `"bottom"`. */
  side?: "bottom" | "top" | "left" | "right";
};

const StackContext = createContext<SurfaceStack | undefined>(undefined);
const DismissContext = createContext<(reason: SurfaceDismissReason) => void>(() => {});

let sharedStack: SurfaceStack | undefined;

/**
 * The stack surfaces join when no provider supplies one. Created on first use,
 * so importing this module never touches the document.
 */
export function getDefaultSurfaceStack() {
  sharedStack ??= createSurfaceStack();
  return sharedStack;
}

/** Props for {@link SurfaceStackProvider}. */
export interface SurfaceStackProviderProps {
  /** The stack every surface below joins. Create it once, outside render, with {@link createSurfaceStack}. */
  stack: SurfaceStack;
  children?: ReactNode;
}

/**
 * Supplies the stack for the surfaces below it, for a host that creates its own
 * to pass a back-button source or to read the pausing signal outside React.
 */
export function SurfaceStackProvider({ stack, children }: SurfaceStackProviderProps) {
  return <StackContext.Provider value={stack}>{children}</StackContext.Provider>;
}

/** The stack in scope: the nearest provider's, else {@link getDefaultSurfaceStack}. */
export function useSurfaceStack() {
  return useContext(StackContext) ?? getDefaultSurfaceStack();
}

const EMPTY_SNAPSHOT = { depth: 0, pausing: false } as const;

/**
 * The stack's snapshot as React state: re-renders when the number of open
 * surfaces or the pausing signal changes. Its `pausing` field is the signal a
 * host maps to a pause reason.
 *
 * @param stack - The stack to read. Defaults to the one in scope.
 */
export function useSurfaceSnapshot(stack?: SurfaceStack) {
  const scoped = useSurfaceStack();
  const source = stack ?? scoped;
  return useSyncExternalStore(source.subscribe, source.getSnapshot, () => EMPTY_SNAPSHOT);
}

function resolveTarget(target: SurfaceFocusTarget | undefined) {
  if (!target) return undefined;
  return typeof target === "function" ? target() : target.current;
}

const BACKDROP_LAYOUT: Record<SurfacePlacement, CSSProperties> = {
  center: { alignItems: "center", justifyContent: "center" },
  left: { alignItems: "stretch", justifyContent: "flex-start" },
  right: { alignItems: "stretch", justifyContent: "flex-end" },
  top: { alignItems: "flex-start", justifyContent: "stretch" },
  bottom: { alignItems: "flex-end", justifyContent: "stretch" },
  fill: { alignItems: "stretch", justifyContent: "stretch" },
};

const PANEL_LAYOUT: Record<SurfacePlacement, CSSProperties> = {
  center: { maxHeight: "100%", maxWidth: "100%" },
  left: { maxHeight: "100%", maxWidth: "100%" },
  right: { maxHeight: "100%", maxWidth: "100%" },
  top: { maxHeight: "100%", width: "100%" },
  bottom: { maxHeight: "100%", width: "100%" },
  fill: { height: "100%", width: "100%" },
};

function backdropLayout(placement: SurfacePlacement): CSSProperties {
  return {
    boxSizing: "border-box",
    display: "flex",
    inset: 0,
    overscrollBehavior: "contain",
    paddingBottom: "var(--surface-inset-bottom, env(safe-area-inset-bottom, 0px))",
    paddingLeft: "var(--surface-inset-left, env(safe-area-inset-left, 0px))",
    paddingRight: "var(--surface-inset-right, env(safe-area-inset-right, 0px))",
    paddingTop: "var(--surface-inset-top, env(safe-area-inset-top, 0px))",
    position: "fixed",
    zIndex: "var(--surface-z, 1000)",
    ...BACKDROP_LAYOUT[placement],
  };
}

function panelLayout(placement: SurfacePlacement): CSSProperties {
  return {
    boxSizing: "border-box",
    overflow: "auto",
    overscrollBehavior: "contain",
    ...PANEL_LAYOUT[placement],
  };
}

type SurfaceInternalProps = SurfaceProps & {
  kind: "surface" | "dialog" | "drawer" | "sheet";
};

function OpenSurface({
  kind,
  placement,
  open: _open,
  onDismiss,
  pauses,
  role = "dialog",
  initialFocus,
  returnFocus,
  stack,
  backdropClassName,
  backdropStyle,
  children,
  style,
  ...rest
}: SurfaceInternalProps) {
  const scoped = useSurfaceStack();
  const activeStack = stack ?? scoped;
  const panel = useRef<HTMLDivElement>(null);
  const handle = useRef<SurfaceHandle | null>(null);
  const pressedBackdrop = useRef(false);
  // What the stack may need after registration reads the latest props through
  // this ref, so a changed callback or `pauses` never closes and reopens the
  // surface.
  const live = useRef({ initialFocus, onDismiss, pauses, returnFocus });
  // Captured during render: a child with `autoFocus` takes focus in the commit,
  // before any effect could read what the opener was.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = activeStack.captureOpener();

  const dismiss = useCallback((reason: SurfaceDismissReason) => {
    live.current.onDismiss?.(reason);
  }, []);

  useLayoutEffect(() => {
    live.current = { initialFocus, onDismiss, pauses, returnFocus };
  });

  useLayoutEffect(() => {
    const registered = activeStack.register({
      container: panel.current as HTMLDivElement,
      initialFocus: () => resolveTarget(live.current.initialFocus),
      onDismiss: dismiss,
      opener: opener.current as HTMLElement | null,
      pauses: live.current.pauses,
      returnFocus: () => resolveTarget(live.current.returnFocus),
    });
    handle.current = registered;
    return () => registered.release();
  }, [activeStack, dismiss]);

  useLayoutEffect(() => {
    (handle.current as SurfaceHandle).update({ onDismiss: dismiss, pauses });
  }, [dismiss, pauses]);

  return (
    <div
      className={backdropClassName}
      data-placement={placement}
      data-surface-backdrop=""
      style={{ ...backdropLayout(placement), ...backdropStyle }}
      onClick={() => {
        const pressed = pressedBackdrop.current;
        pressedBackdrop.current = false;
        if (pressed) dismiss("backdrop");
      }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is "dialog" or "alertdialog", both of which support aria-modal; the linter cannot see through the variable */}
      <div
        {...rest}
        ref={panel}
        aria-modal="true"
        data-placement={placement}
        data-surface={kind}
        role={role}
        style={{ ...panelLayout(placement), ...style }}
      >
        <DismissContext.Provider value={dismiss}>{children}</DismissContext.Provider>
      </div>
    </div>
  );
}

function SurfaceBase(props: SurfaceInternalProps) {
  return props.open ? <OpenSurface {...props} /> : null;
}

/**
 * A modal layer over the page, placed by `placement`, with no styling of its
 * own. It joins a {@link SurfaceStack}: focus moves into it on open, Tab wraps
 * inside it, Escape and back ask `onDismiss` to close it while it is on top,
 * and focus returns to the opener on close.
 *
 * It renders a full-frame backdrop `<div data-surface-backdrop>` holding a
 * panel `<div role="dialog" aria-modal data-surface data-placement>`. The only
 * styles it sets are structural (fixed position, flex placement, safe-area
 * insets, scrolling) and every one reads a CSS custom property the host can
 * set: `--surface-z`, `--surface-inset-top`, `-right`, `-bottom`, `-left`.
 * Everything visual belongs to the host, through `className`, `style`,
 * `backdropClassName` and `backdropStyle`.
 *
 * A surface may be rendered inside another's content, but a transformed
 * ancestor makes `position: fixed` relative to that ancestor, so render
 * nested surfaces as siblings when the lower one animates with a transform.
 * Of two surfaces at the same z-index, the later in the document is on top.
 */
export function Surface(props: SurfaceProps) {
  return <SurfaceBase {...props} kind="surface" />;
}

/** A surface centred in the frame, for a choice or confirmation. */
export function Dialog(props: DialogProps) {
  return <SurfaceBase {...props} kind="dialog" placement="center" />;
}

/** A full-height panel attached to the left or right edge, for secondary navigation. */
export function Drawer({ side = "right", ...props }: DrawerProps) {
  return <SurfaceBase {...props} kind="drawer" placement={side} />;
}

/** A panel that rises from an edge and takes the width of the frame (or the height, from a side), for supporting content. */
export function Sheet({ side = "bottom", ...props }: SheetProps) {
  return <SurfaceBase {...props} kind="sheet" placement={side} />;
}

/** Props for {@link SurfaceClose}. */
export type SurfaceCloseProps = Omit<ComponentPropsWithoutRef<"button">, "type">;

/**
 * A button that asks the surface around it to close (`onDismiss("close")`).
 * It renders only the children the host passes, so name it with `aria-label`
 * or visible text. Its minimum size is `var(--surface-target, 48px)`; the host
 * raises `--surface-target` (for example to 64px) to enlarge every target at
 * once. Outside a surface it does nothing.
 */
export function SurfaceClose({ onClick, style, ...rest }: SurfaceCloseProps) {
  const dismiss = useContext(DismissContext);
  return (
    <button
      {...rest}
      data-surface-close=""
      style={{
        minHeight: "var(--surface-target, 48px)",
        minWidth: "var(--surface-target, 48px)",
        ...style,
      }}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) dismiss("close");
      }}
    />
  );
}
