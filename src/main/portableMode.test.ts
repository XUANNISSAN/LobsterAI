import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  PORTABLE_DATA_DIR_NAME,
  PORTABLE_LOGS_DIR_NAME,
  PORTABLE_MARKER_FILE_NAME,
} from '../shared/appSettings/portableMode';
import { DB_FILENAME } from './appConstants';
import {
  buildPortableModePaths,
  copyPortableDataSync,
  getPortableDataDir,
  getPortableLogDir,
  getPortableMarkerPath,
  isPortableMarkerPresent,
  portableDataDirHasDatabase,
  resolvePortableBaseDir,
} from './portableMode';

describe('resolvePortableBaseDir', () => {
  test('prefers the NSIS portable launcher directory', () => {
    const portableDir = 'D:\\apps\\LobsterAI';
    expect(
      resolvePortableBaseDir({
        execPath: 'C:\\temp\\unpacked\\LobsterAI.exe',
        portableExecutableDir: portableDir,
      }),
    ).toBe(path.resolve(portableDir));
  });

  test('falls back to the executable directory', () => {
    expect(
      resolvePortableBaseDir({
        execPath: path.resolve('/opt/apps/lobsterai/LobsterAI'),
        portableExecutableDir: null,
      }),
    ).toBe(path.resolve('/opt/apps/lobsterai'));
  });

  test('returns null when no executable path is available', () => {
    expect(resolvePortableBaseDir({ execPath: '', portableExecutableDir: null })).toBeNull();
  });

  test('rejects the filesystem root as a base dir', () => {
    expect(
      resolvePortableBaseDir({
        execPath: path.parse(process.cwd()).root,
        portableExecutableDir: null,
      }),
    ).toBeNull();
  });
});

describe('marker and path helpers', () => {
  test('computes data, log and marker paths from the base dir', () => {
    const baseDir = path.resolve('/app/lobsterai');
    expect(getPortableMarkerPath(baseDir)).toBe(path.join(baseDir, PORTABLE_MARKER_FILE_NAME));
    expect(getPortableDataDir(baseDir)).toBe(path.join(baseDir, PORTABLE_DATA_DIR_NAME));
    expect(getPortableLogDir(baseDir)).toBe(
      path.join(baseDir, PORTABLE_DATA_DIR_NAME, PORTABLE_LOGS_DIR_NAME),
    );
  });

  test('detects the marker file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-portable-'));
    try {
      expect(isPortableMarkerPresent(dir)).toBe(false);
      fs.writeFileSync(path.join(dir, PORTABLE_MARKER_FILE_NAME), '');
      expect(isPortableMarkerPresent(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildPortableModePaths', () => {
  test('reports active state from the marker', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-portable-'));
    try {
      fs.writeFileSync(path.join(dir, PORTABLE_MARKER_FILE_NAME), '');
      const status = buildPortableModePaths({
        baseDir: dir,
        defaultUserDataDir: path.join(dir, 'default-user-data'),
        supported: true,
      });
      expect(status.active).toBe(true);
      expect(status.dataDir).toBe(getPortableDataDir(dir));
      expect(status.markerPath).toBe(getPortableMarkerPath(dir));
      expect(status.supported).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('carries unsupported reason', () => {
    const status = buildPortableModePaths({
      baseDir: null,
      defaultUserDataDir: '/default',
      supported: false,
      unsupportedReason: 'dev build',
    });
    expect(status.active).toBe(false);
    expect(status.baseDir).toBeNull();
    expect(status.unsupportedReason).toBe('dev build');
  });
});

describe('copyPortableDataSync', () => {
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-portable-src-'));
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-portable-dst-'));
  });

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  test('copies user data but skips Chromium caches and SQLite files', () => {
    fs.mkdirSync(path.join(sourceDir, 'SKILLs'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILLs', 'a.md'), 'skill');
    fs.writeFileSync(path.join(sourceDir, 'preferences.json'), '{}');
    fs.writeFileSync(path.join(sourceDir, DB_FILENAME), 'sqlite');
    fs.writeFileSync(path.join(sourceDir, `${DB_FILENAME}-wal`), 'wal');
    fs.mkdirSync(path.join(sourceDir, 'Cache'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'Cache', 'data_0'), 'cache');
    fs.mkdirSync(path.join(sourceDir, 'GPUCache'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'GPUCache', 'data'), 'cache-gpu');

    const result = copyPortableDataSync(sourceDir, targetDir);

    expect(result.copied).toBe(true);
    expect(result.skipped).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'SKILLs', 'a.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'preferences.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, DB_FILENAME))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, `${DB_FILENAME}-wal`))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'Cache'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'GPUCache'))).toBe(false);
  });

  test('skips the copy when the target already has a database', () => {
    fs.writeFileSync(path.join(sourceDir, 'SKILLs-x'), 'x');
    fs.writeFileSync(path.join(targetDir, DB_FILENAME), 'existing');

    const result = copyPortableDataSync(sourceDir, targetDir);

    expect(result.copied).toBe(false);
    expect(result.skipped).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'SKILLs-x'))).toBe(false);
  });

  test('skips cleanly when the source dir does not exist', () => {
    const result = copyPortableDataSync(path.join(sourceDir, 'missing'), targetDir);
    expect(result.copied).toBe(false);
    expect(result.skipped).toBe(true);
  });
});

describe('portableDataDirHasDatabase', () => {
  test('detects a database file in the target dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-db-'));
    try {
      expect(portableDataDirHasDatabase(dir)).toBe(false);
      fs.writeFileSync(path.join(dir, DB_FILENAME), 'main');
      expect(portableDataDirHasDatabase(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
