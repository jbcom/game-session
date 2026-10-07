// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { GameSettings } from "../src/runtime";
import {
  GameErrorBoundary,
  GameMenuButton,
  GamePauseMenu,
  GameSettingsPanel,
  RuntimeResultRecorder,
} from "../src/ui";

const settings: GameSettings = {
  graphicsQuality: "balanced",
  handedness: "right",
  hapticsEnabled: true,
  joystickSensitivity: 1,
  reducedMotion: false,
  soundEnabled: true,
  textScale: 1,
};

describe("GameMenuButton", () => {
  test("carries data-joystick-ignore so the virtual joystick never captures it", () => {
    render(<GameMenuButton onClick={() => {}} />);
    expect(screen.getByTestId("game-menu-button")).toHaveAttribute("data-joystick-ignore", "true");
  });
});

describe("GamePauseMenu", () => {
  test("renders resume/restart/settings/rules/main-menu/quit actions when open", async () => {
    const onClose = vi.fn();
    const onRestart = vi.fn();

    render(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        rules={["Rule one"]}
        settings={settings}
        onMainMenu={() => {}}
        onClose={onClose}
        onQuitRun={() => {}}
        onRestart={onRestart}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.getByTestId("game-pause-menu")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Restart")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Restart"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  test("shows the eyebrow line above the title only when one is given", () => {
    const { rerender } = render(
      <GamePauseMenu
        eyebrow="Example Studio"
        gameTitle="Test Game"
        open
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.getByText("Example Studio")).toBeInTheDocument();

    rerender(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.queryByText("Example Studio")).not.toBeInTheDocument();
  });

  test("renders nothing when closed", () => {
    const { container } = render(
      <GamePauseMenu
        gameTitle="Test Game"
        open={false}
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("shows the active-run banner when a save slot is present", () => {
    render(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        saveSlot={{
          slug: "test-game",
          mode: "standard",
          status: "active",
          label: "Resume Run",
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          progressSummary: "Wave 3",
        }}
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.getByText(/Active run: Wave 3/)).toBeInTheDocument();
  });

  test("disables the Rules action when no rules are given, and calls onClose/onQuitRun/onMainMenu", async () => {
    const onClose = vi.fn();
    const onQuitRun = vi.fn();
    const onMainMenu = vi.fn();

    render(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        settings={settings}
        onMainMenu={onMainMenu}
        onClose={onClose}
        onQuitRun={onQuitRun}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.getByText("Rules").closest("button")).toBeDisabled();

    await userEvent.click(screen.getByText("Resume"));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("Quit Run"));
    expect(onQuitRun).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("Main Menu"));
    expect(onMainMenu).toHaveBeenCalledTimes(1);
  });

  test("navigates into the settings panel, changes settings, and returns to the main menu", async () => {
    const onSettingsChange = vi.fn();

    render(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={onSettingsChange}
      />
    );

    await userEvent.click(screen.getByText("Settings"));
    const panel = screen.getByTestId("game-settings-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Settings", { selector: "h2" })).toBeInTheDocument();

    await userEvent.click(within(panel).getByText("Sound"));
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    // the settings panel hands the pause menu an updater function
    const updater = onSettingsChange.mock.calls[0][0] as (current: GameSettings) => GameSettings;
    expect(updater(settings).soundEnabled).toBe(false);

    await userEvent.click(within(panel).getByText("Back"));
    expect(screen.queryByTestId("game-settings-panel")).not.toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  test("navigates into the rules panel, lists rules in order, and returns to the main menu", async () => {
    render(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        rules={["Collect the orbs.", "Do not touch the walls."]}
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    await userEvent.click(screen.getByText("Rules"));
    const panel = screen.getByTestId("game-rules-panel");
    expect(within(panel).getByText("Collect the orbs.")).toBeInTheDocument();
    expect(within(panel).getByText("Do not touch the walls.")).toBeInTheDocument();

    await userEvent.click(within(panel).getByText("Back"));
    expect(screen.queryByTestId("game-rules-panel")).not.toBeInTheDocument();
  });

  test("resets to the menu view whenever it is reopened", async () => {
    const { rerender } = render(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    await userEvent.click(screen.getByText("Settings"));
    expect(screen.getByTestId("game-settings-panel")).toBeInTheDocument();

    rerender(
      <GamePauseMenu
        gameTitle="Test Game"
        open={false}
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );
    rerender(
      <GamePauseMenu
        gameTitle="Test Game"
        open
        settings={settings}
        onMainMenu={() => {}}
        onClose={() => {}}
        onQuitRun={() => {}}
        onRestart={() => {}}
        onSettingsChange={() => {}}
      />
    );

    expect(screen.queryByTestId("game-settings-panel")).not.toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });
});

describe("GameSettingsPanel", () => {
  test("toggles booleans, changes segmented and range settings via onSettingsChange updater", async () => {
    const onSettingsChange = vi.fn();

    render(
      <GameSettingsPanel
        settings={settings}
        onBack={() => {}}
        onSettingsChange={onSettingsChange}
      />
    );

    const applyLatestUpdate = () => {
      const updater = onSettingsChange.mock.calls.at(-1)?.[0] as (
        current: GameSettings
      ) => GameSettings;
      return updater(settings);
    };

    await userEvent.click(screen.getByText("Haptics"));
    expect(applyLatestUpdate().hapticsEnabled).toBe(false);

    await userEvent.click(screen.getByText("Reduced Motion"));
    expect(applyLatestUpdate().reducedMotion).toBe(true);

    await userEvent.click(screen.getByText("High"));
    expect(applyLatestUpdate().graphicsQuality).toBe("high");

    await userEvent.click(screen.getByText("Left"));
    expect(applyLatestUpdate().handedness).toBe("left");

    const [joystickRange, textScaleRange] = screen.getAllByRole("slider");
    fireEventChange(joystickRange, "1.2");
    expect(applyLatestUpdate().joystickSensitivity).toBe(1.2);

    fireEventChange(textScaleRange, "1.1");
    expect(applyLatestUpdate().textScale).toBe(1.1);
  });

  test("calls onBack when the back button is clicked", async () => {
    const onBack = vi.fn();
    render(<GameSettingsPanel settings={settings} onBack={onBack} onSettingsChange={() => {}} />);

    await userEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("shows the muted icon when sound is disabled", () => {
    render(
      <GameSettingsPanel
        settings={{ ...settings, soundEnabled: false }}
        onBack={() => {}}
        onSettingsChange={() => {}}
      />
    );

    const soundToggle = screen.getByText("Sound").closest("button") as HTMLElement;
    expect(soundToggle.querySelector("svg.lucide-volume-x")).toBeInTheDocument();
  });
});

function fireEventChange(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("GameErrorBoundary", () => {
  test("renders children when there is no error", () => {
    render(
      <GameErrorBoundary>
        <p>All good</p>
      </GameErrorBoundary>
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  test("catches a render error and shows the fallback with a return-to-menu action", async () => {
    const onReturnToMenu = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    function Boom(): never {
      throw new Error("boom");
    }

    render(
      <GameErrorBoundary onReturnToMenu={onReturnToMenu}>
        <Boom />
      </GameErrorBoundary>
    );

    const returnButton = screen.getByRole("button", { name: "Return To Menu" });
    expect(returnButton).toBeInTheDocument();

    await userEvent.click(returnButton);
    expect(onReturnToMenu).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });

  test("resets its error state when boundaryKey changes", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    function MaybeBoom({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) throw new Error("boom");
      return <p>Recovered</p>;
    }

    const { rerender } = render(
      <GameErrorBoundary boundaryKey="game-1">
        <MaybeBoom shouldThrow />
      </GameErrorBoundary>
    );

    expect(screen.getByRole("button", { name: "Return To Menu" })).toBeInTheDocument();

    rerender(
      <GameErrorBoundary boundaryKey="game-2">
        <MaybeBoom shouldThrow={false} />
      </GameErrorBoundary>
    );

    expect(screen.getByText("Recovered")).toBeInTheDocument();

    consoleError.mockRestore();
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
    // sessionsCompleted stays 1) -- the recorder guards its result key with a ref
    // so unrelated re-renders never record the same run twice.
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

  test("records again when the result key changes (a genuinely new result)", () => {
    const { rerender } = render(
      <RuntimeResultRecorder
        mode="standard"
        namespace="ui-test:v1"
        score={100}
        slug="rerecord-game"
        status="completed"
      />
    );

    rerender(
      <RuntimeResultRecorder
        mode="standard"
        namespace="ui-test:v1"
        score={250}
        slug="rerecord-game"
        status="completed"
      />
    );

    const raw = localStorage.getItem("ui-test:v1:progress:rerecord-game");
    const progress = JSON.parse(raw as string);
    expect(progress.sessionsCompleted).toBe(2);
    expect(progress.bestScore).toBe(250);
  });
});
