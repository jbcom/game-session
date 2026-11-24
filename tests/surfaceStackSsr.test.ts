// @vitest-environment node
//
// The stack is created at module scope by hosts that may import it during
// server rendering, so with no `document` anywhere it must be inert rather than
// throw. That guard only has something to prove where `document` is absent.
import { describe, expect, test } from "vitest";
import { createSurfaceStack } from "../src/surfaceStack";

describe("a surface stack without a DOM", () => {
  test("registering is a harmless no-op", () => {
    expect(typeof document).toBe("undefined");
    const stack = createSurfaceStack();
    const handle = stack.register({ container: {} as HTMLElement });
    handle.update({ pauses: false });
    handle.release();
    expect(stack.getSnapshot()).toEqual({ depth: 0, pausing: false });
    expect(stack.dismiss()).toBe(false);
    expect(stack.captureOpener()).toBeNull();
    stack.dispose();
  });
});
