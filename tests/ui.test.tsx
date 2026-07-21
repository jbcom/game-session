// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { GameSettings } from "../src/runtime";
import { CabinetMenuButton, CabinetPauseMenu, RuntimeResultRecorder } from "../src/ui";

const settings: GameSettings = {
  graphicsQuality: "balanced",
  handedness: "right",
  hapticsEnabled: true,
  joystickSensitivity: 1,
  reducedMotion: false,
  soundEnabled: true,
  textScale: 1,
};

describe("CabinetMenuButton", () => {
  test("carries data-joystick-ignore so the virtual joystick never captures it", () => {
    render(<CabinetMenuButton onClick={() => {}} />);
    expect(screen.getByTestId("cabinet-menu-button")).toHaveAttribute(
      "data-joystick-ignore",
      "true"
    );
  });
});

describe("CabinetPauseMenu", () => {
  test("renders resume/restart/settings/rules/cabinet/quit actions when open", async () => {
    const onClose = vi.fn();
    const onRestart = vi.fn();

    render(
      <CabinetPauseMenu
        gameTitle="Test Game"
        open
        rules={["Rule one"]}
        settings={settings}
        onCabinet={() => {}}
        onClose={onClose}
        onQuitRun={() => {}}
        onRestart={onRestart}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.getByTestId("cabinet-pause-menu")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Restart")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Restart"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  test("renders nothing when closed", () => {
    const { container } = render(
      <CabinetPauseMenu
        gameTitle="Test Game"
        open={false}
        settings={settings}
        onCabinet={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("RuntimeResultRecorder", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("dedupes result writes across re-renders with the same result key", () => {
    const { rerender } = render(
      <RuntimeResultRecorder
        mode="standard"
        namespace="ui-test:v1"
        score={100}
        slug="test-game"
        status="completed"
      />
    );

    // Re-render with identical props: must not double-record (bestScore stays 100,
    // sessionsCompleted stays 1) -- this is the exact correctness property the
    // tournament ledger called out (a useRef-guarded resultKey).
    rerender(
      <RuntimeResultRecorder
        mode="standard"
        namespace="ui-test:v1"
        score={100}
        slug="test-game"
        status="completed"
      />
    );

    const raw = localStorage.getItem("ui-test:v1:progress:test-game");
    expect(raw).toBeTruthy();
    const progress = JSON.parse(raw as string);
    expect(progress.sessionsCompleted).toBe(1);
    expect(progress.bestScore).toBe(100);
  });
});
