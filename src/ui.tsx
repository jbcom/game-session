import {
  ArrowLeft,
  BookOpen,
  Gauge,
  Home,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  Component,
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCabinetRuntime } from "./react.js";
import type { GameRunStatus, GameSaveSlot, GameSettings } from "./runtime.js";
import type { SessionMode } from "./sessionMode.js";

/** Props for {@link CabinetMenuButton}. */
export interface CabinetMenuButtonProps {
  /** Called when the button is clicked -- typically opens {@link CabinetPauseMenu}. */
  onClick: () => void;
  /** Accessible label and tooltip text. Defaults to `"Open cabinet menu"`. */
  title?: string;
}

/**
 * A fixed-position, top-left pause/menu button. Carries
 * `data-joystick-ignore="true"` so an on-screen virtual joystick never
 * captures pointer events meant for this button -- render it alongside your
 * game canvas and wire `onClick` to open {@link CabinetPauseMenu}.
 */
export function CabinetMenuButton({
  onClick,
  title = "Open cabinet menu",
}: CabinetMenuButtonProps) {
  return (
    <button
      type="button"
      aria-label={title}
      className="fixed left-3 top-3 z-50 grid h-12 w-12 place-items-center rounded-md border border-white/18 bg-black/72 text-white shadow-[0_12px_30px_rgba(0,0,0,0.38)] backdrop-blur transition hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 sm:left-4 sm:top-4"
      data-joystick-ignore="true"
      data-testid="cabinet-menu-button"
      title={title}
      onClick={onClick}
    >
      <Pause size={20} />
    </button>
  );
}

/** Props for {@link RuntimeResultRecorder}. */
export interface RuntimeResultRecorderProps {
  /** The game the result belongs to. */
  slug: string;
  /** The session mode the run was played in. */
  mode: SessionMode;
  /** How the run ended. Never `"active"`. */
  status: Exclude<GameRunStatus, "active">;
  /** The run's score. */
  score: number;
  /** Player-facing summary. Defaults to a status-based phrase when omitted. */
  summary?: string;
  /** Optional free-form per-run stats. */
  stats?: Record<string, number | string | boolean>;
  /** Milestone identifiers earned by this run. */
  milestones?: readonly string[];
  /** localStorage key namespace forwarded to useCabinetRuntime. */
  namespace?: string;
}

/**
 * Records a {@link GameResult} on mount (and again whenever the props
 * describing the result change) by calling `finishRun` internally, then
 * renders nothing. Drop this into a "game over" screen instead of calling
 * `useCabinetRuntime().finishRun` yourself when you'd rather express the
 * result as declarative props.
 *
 * Dedupes by a hash of all its props: re-rendering with the exact same
 * `slug`/`mode`/`status`/`score`/`summary`/`stats`/`milestones` will not
 * record the result twice, so this is safe to mount on a screen that itself
 * re-renders for unrelated reasons.
 */
export function RuntimeResultRecorder({
  milestones = [],
  mode,
  namespace,
  score,
  slug,
  stats,
  status,
  summary,
}: RuntimeResultRecorderProps) {
  const { finishRun } = useCabinetRuntime(slug, { namespace });
  const recordedKey = useRef<string | null>(null);
  const resultKey = useMemo(
    () => JSON.stringify({ milestones, mode, score, slug, stats, status, summary }),
    [milestones, mode, score, slug, stats, status, summary]
  );

  useEffect(() => {
    if (recordedKey.current === resultKey) return;
    recordedKey.current = resultKey;
    finishRun({
      milestones,
      mode,
      score,
      stats,
      status,
      summary,
    });
  }, [finishRun, milestones, mode, resultKey, score, stats, status, summary]);

  return null;
}

/** Props for {@link CabinetPauseMenu}. */
export interface CabinetPauseMenuProps {
  /** Displayed in the header when the main menu view is showing. */
  gameTitle: string;
  /** Whether the menu is open. Renders nothing (`null`) when `false`. */
  open: boolean;
  /** Numbered rules shown in the "Rules" sub-view. The "Rules" action is disabled when empty. */
  rules?: readonly string[];
  /** The active run's save slot, if any -- shown as an "Active run: ..." banner on the main view. */
  saveSlot?: GameSaveSlot;
  /** Current settings, passed through to the "Settings" sub-view. */
  settings: GameSettings;
  /** Called when the "Cabinet" action is clicked (return to the game-select shell). */
  onCabinet: () => void;
  /** Called when the "Resume" action or the header close button is clicked. */
  onClose: () => void;
  /** Called when the "Quit Run" action is clicked (abandon the current run). */
  onQuitRun: () => void;
  /** Called when the "Restart" action is clicked. */
  onRestart: () => void;
  /** Called with the updated settings whenever the "Settings" sub-view changes a value. */
  onSettingsChange: (next: GameSettings | ((current: GameSettings) => GameSettings)) => void;
}

/**
 * A full-screen pause menu with three views: the main menu (Resume, Restart,
 * Settings, Rules, Cabinet, Quit Run), an embedded {@link CabinetSettingsPanel},
 * and a rules list. Purely presentational -- it owns no persistence or
 * routing; wire its `on*` callbacks to {@link useCabinetRuntime}'s
 * `abandonRun`/`setSettings`/etc and your own restart/navigation logic.
 * Always resets to the main menu view when reopened.
 */
export function CabinetPauseMenu({
  gameTitle,
  open,
  rules = [],
  saveSlot,
  settings,
  onCabinet,
  onClose,
  onQuitRun,
  onRestart,
  onSettingsChange,
}: CabinetPauseMenuProps) {
  const [view, setView] = useState<"menu" | "settings" | "rules">("menu");

  useEffect(() => {
    if (!open) setView("menu");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/64 p-3 text-white backdrop-blur-md sm:p-5"
      data-joystick-ignore="true"
      data-testid="cabinet-pause-menu"
      role="dialog"
      aria-modal="true"
      aria-label={`${gameTitle} pause menu`}
    >
      <section className="grid max-h-[92svh] w-[min(94vw,720px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-white/14 bg-[#111116] shadow-[0_30px_90px_rgba(0,0,0,0.62)]">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/44 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="font-mono text-[0.62rem] font-black uppercase tracking-[0.26em] text-cyan-200/70">
              Arcade Cabinet
            </p>
            <h2 className="truncate font-display text-2xl font-black uppercase tracking-wide">
              {view === "settings" ? "Settings" : gameTitle}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Resume game"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/14 bg-white/8 transition hover:bg-white/14 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {view === "settings" ? (
            <CabinetSettingsPanel
              settings={settings}
              onBack={() => setView("menu")}
              onSettingsChange={onSettingsChange}
            />
          ) : view === "rules" ? (
            <CabinetRulesPanel rules={rules} onBack={() => setView("menu")} />
          ) : (
            <div className="grid gap-4">
              {saveSlot ? (
                <div className="rounded-md border border-cyan-300/22 bg-cyan-300/8 p-3 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-cyan-100/78">
                  Active run: {saveSlot.progressSummary}
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <PauseAction icon={<Play size={18} />} label="Resume" onClick={onClose} />
                <PauseAction icon={<RotateCcw size={18} />} label="Restart" onClick={onRestart} />
                <PauseAction
                  icon={<Settings size={18} />}
                  label="Settings"
                  onClick={() => setView("settings")}
                />
                <PauseAction
                  disabled={rules.length === 0}
                  icon={<BookOpen size={18} />}
                  label="Rules"
                  onClick={() => setView("rules")}
                />
                <PauseAction icon={<Home size={18} />} label="Cabinet" onClick={onCabinet} />
                <PauseAction icon={<ArrowLeft size={18} />} label="Quit Run" onClick={onQuitRun} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

interface CabinetRulesPanelProps {
  rules: readonly string[];
  onBack: () => void;
}

function CabinetRulesPanel({ onBack, rules }: CabinetRulesPanelProps) {
  return (
    <div className="grid gap-4" data-testid="cabinet-rules-panel">
      <button
        type="button"
        className="flex w-fit items-center gap-2 rounded-md border border-white/14 bg-white/8 px-3 py-2 font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-white/74 hover:bg-white/14 focus:outline-none focus:ring-2 focus:ring-cyan-300"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        Back
      </button>
      <ol className="grid gap-3">
        {rules.map((rule, index) => (
          <li
            key={rule}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border border-white/12 bg-white/[0.05] p-3"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-cyan-300/14 font-mono text-[0.72rem] font-black text-cyan-100">
              {index + 1}
            </span>
            <span className="text-sm font-semibold leading-relaxed text-white/82">{rule}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Props for {@link CabinetSettingsPanel}. */
export interface CabinetSettingsPanelProps {
  /** Current settings to render controls for. */
  settings: GameSettings;
  /** Called when the "Back" button is clicked. */
  onBack: () => void;
  /** Called with the updated settings whenever any control changes a value. */
  onSettingsChange: (next: GameSettings | ((current: GameSettings) => GameSettings)) => void;
}

/**
 * Standalone settings form: toggles for sound/haptics/reduced-motion,
 * segmented controls for graphics quality and handedness, and range sliders
 * for joystick sensitivity and text scale. {@link CabinetPauseMenu} embeds
 * this as its "Settings" sub-view, but it renders and functions the same on
 * its own -- mount it directly for a standalone settings screen.
 */
export function CabinetSettingsPanel({
  settings,
  onBack,
  onSettingsChange,
}: CabinetSettingsPanelProps) {
  const update = (patch: Partial<GameSettings>) => {
    onSettingsChange((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="grid gap-4" data-testid="cabinet-settings-panel">
      <button
        type="button"
        className="flex w-fit items-center gap-2 rounded-md border border-white/14 bg-white/8 px-3 py-2 font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-white/74 hover:bg-white/14 focus:outline-none focus:ring-2 focus:ring-cyan-300"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <SettingToggle
          icon={settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          label="Sound"
          value={settings.soundEnabled}
          onChange={(value) => update({ soundEnabled: value })}
        />
        <SettingToggle
          icon={<Gauge size={18} />}
          label="Haptics"
          value={settings.hapticsEnabled}
          onChange={(value) => update({ hapticsEnabled: value })}
        />
        <SettingToggle
          icon={<Gauge size={18} />}
          label="Reduced Motion"
          value={settings.reducedMotion}
          onChange={(value) => update({ reducedMotion: value })}
        />
      </div>

      <SegmentedSetting
        label="Graphics"
        options={[
          { label: "Low", value: "low" },
          { label: "Balanced", value: "balanced" },
          { label: "High", value: "high" },
        ]}
        value={settings.graphicsQuality}
        onChange={(value) => update({ graphicsQuality: value as GameSettings["graphicsQuality"] })}
      />
      <SegmentedSetting
        label="Handedness"
        options={[
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ]}
        value={settings.handedness}
        onChange={(value) => update({ handedness: value as GameSettings["handedness"] })}
      />
      <RangeSetting
        label="Joystick"
        max={1.6}
        min={0.65}
        step={0.05}
        value={settings.joystickSensitivity}
        onChange={(value) => update({ joystickSensitivity: value })}
      />
      <RangeSetting
        label="Text Scale"
        max={1.25}
        min={0.9}
        step={0.05}
        value={settings.textScale}
        onChange={(value) => update({ textScale: value })}
      />
    </div>
  );
}

/** Props for {@link CabinetErrorBoundary}. */
export interface CabinetErrorBoundaryProps extends PropsWithChildren {
  /**
   * Changing this value clears any caught error and gives `children` a fresh
   * attempt to render -- e.g. set it to the current game's slug so
   * navigating to a different game after a crash doesn't stay stuck on the
   * fallback UI.
   */
  boundaryKey?: string;
  /** Called when the fallback UI's "Return To Cabinet" button is clicked. */
  onReturnToCabinet?: () => void;
}

interface CabinetErrorBoundaryState {
  error?: Error;
  boundaryKey?: string;
}

/**
 * A React error boundary that catches render errors from `children` (e.g. a
 * WebGL boot failure) and shows a "Return To Cabinet" fallback instead of a
 * blank crashed page, logging the error via `console.error`. Wrap a game's
 * boot/render tree in this so one cartridge failing to start doesn't take
 * down the whole cabinet shell.
 *
 * The caught error persists across re-renders until `boundaryKey` changes
 * (see {@link CabinetErrorBoundaryProps.boundaryKey}) -- an error boundary
 * cannot otherwise reset itself once tripped.
 */
export class CabinetErrorBoundary extends Component<
  CabinetErrorBoundaryProps,
  CabinetErrorBoundaryState
> {
  state: CabinetErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): CabinetErrorBoundaryState {
    return { error };
  }

  static getDerivedStateFromProps(
    props: CabinetErrorBoundaryProps,
    state: CabinetErrorBoundaryState
  ): CabinetErrorBoundaryState | null {
    if (state.boundaryKey !== props.boundaryKey) {
      // A changed boundaryKey is the caller asking for a fresh attempt (e.g.
      // "Return to Cabinet" then relaunch) -- clear the caught error along
      // with the key, or the fallback UI would be stuck forever.
      return { boundaryKey: props.boundaryKey, error: undefined };
    }

    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Game boot failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid h-[100svh] place-items-center bg-slate-950 p-5 text-white">
        <section className="grid w-[min(92vw,560px)] gap-4 rounded-md border border-rose-300/28 bg-white/8 p-5 shadow-2xl">
          <p className="font-mono text-[0.62rem] font-black uppercase tracking-[0.24em] text-rose-200">
            WebGL Boot Fallback
          </p>
          <h1 className="font-display text-3xl font-black uppercase">Return To Cabinet</h1>
          <p className="text-sm leading-relaxed text-slate-200">
            This cartridge failed to start cleanly. Your local progress is preserved, and the
            cabinet can continue without reloading the app.
          </p>
          <button
            type="button"
            className="inline-flex w-fit items-center gap-2 rounded-md border border-cyan-300/45 bg-cyan-300/12 px-4 py-3 font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-cyan-100 hover:bg-cyan-300/18 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            onClick={this.props.onReturnToCabinet}
          >
            <Home size={17} />
            Return To Cabinet
          </button>
        </section>
      </div>
    );
  }
}

interface PauseActionProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function PauseAction({ disabled = false, icon, label, onClick }: PauseActionProps) {
  return (
    <button
      type="button"
      className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border border-white/14 bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/12 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-38"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="grid h-10 w-10 place-items-center rounded-md bg-white/10 text-cyan-100">
        {icon}
      </span>
      <span className="font-mono text-[0.7rem] font-black uppercase tracking-[0.18em]">
        {label}
      </span>
    </button>
  );
}

interface SettingToggleProps {
  icon: ReactNode;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

function SettingToggle({ icon, label, value, onChange }: SettingToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={value}
      className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-white/14 bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/12 focus:outline-none focus:ring-2 focus:ring-cyan-300"
      onClick={() => onChange(!value)}
    >
      <span className="grid h-10 w-10 place-items-center rounded-md bg-white/10 text-cyan-100">
        {icon}
      </span>
      <span className="font-mono text-[0.7rem] font-black uppercase tracking-[0.18em]">
        {label}
      </span>
      <span className="rounded-full border border-white/18 bg-black/24 px-3 py-1 font-mono text-[0.62rem] font-black uppercase tracking-[0.16em]">
        {value ? "On" : "Off"}
      </span>
    </button>
  );
}

interface SegmentedSettingProps {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}

function SegmentedSetting({ label, options, value, onChange }: SegmentedSettingProps) {
  return (
    <fieldset className="grid gap-2 rounded-md border border-white/14 bg-white/[0.04] p-3">
      <legend className="px-1 font-mono text-[0.62rem] font-black uppercase tracking-[0.22em] text-white/54">
        {label}
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className="rounded-md border px-3 py-3 font-mono text-[0.68rem] font-black uppercase tracking-[0.16em] focus:outline-none focus:ring-2 focus:ring-cyan-300"
              style={{
                background: active ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.05)",
                borderColor: active ? "rgba(103,232,249,0.58)" : "rgba(255,255,255,0.16)",
              }}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface RangeSettingProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function RangeSetting({ label, max, min, onChange, step, value }: RangeSettingProps) {
  return (
    <label className="grid gap-2 rounded-md border border-white/14 bg-white/[0.04] p-3">
      <span className="flex items-center justify-between gap-3 font-mono text-[0.62rem] font-black uppercase tracking-[0.22em] text-white/54">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </span>
      <input
        className="accent-cyan-300"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
