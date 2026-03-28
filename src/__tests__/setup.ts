/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';

// Mock Tauri APIs since we're in a browser test environment
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join('/'))),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    sidecar: vi.fn(() => ({
      execute: vi.fn(),
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      spawn: vi.fn(),
    })),
  },
}));
