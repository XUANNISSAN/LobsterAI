/**
 * Portable-mode contract shared across main, preload and renderer.
 *
 * Portable mode is marker-file based so the main process can decide where to
 * keep user data BEFORE the SQLite store (and Chromium session) is opened:
 * the marker lives next to the executable (`<appDir>/portable.mode`), and all
 * user data is kept under `<appDir>/data` (logs under `<appDir>/data/logs`).
 *
 * The marker is the source of truth; `app_config.portableMode` is only a hint
 * for the settings UI.
 */

export const PORTABLE_MARKER_FILE_NAME = 'portable.mode';
export const PORTABLE_DATA_DIR_NAME = 'data';
export const PORTABLE_LOGS_DIR_NAME = 'logs';

export type PortableModeStatus = {
  /** Whether the app is currently running in portable mode (marker present). */
  active: boolean;
  /** Directory that contains LobsterAI.exe (or the portable launcher). */
  baseDir: string | null;
  /** Directory where portable data lives (`<appDir>/data`). */
  dataDir: string | null;
  /** Portable logs directory (`<appDir>/data/logs`). */
  logDir: string | null;
  /** Default (non-portable) user data directory, e.g. %APPDATA%/LobsterAI. */
  defaultUserDataDir: string;
  /** Marker file path (`<appDir>/portable.mode`). */
  markerPath: string | null;
  /** false when the platform/packaging does not allow portable mode. */
  supported: boolean;
  /** Human-readable reason when `supported` is false. */
  unsupportedReason?: string;
};

export type PortableModeSetResult = {
  success: boolean;
  active: boolean;
  /** True when user data was copied to the new location during this call. */
  migrated: boolean;
  sourceDir: string;
  targetDir: string;
  error?: string;
};
