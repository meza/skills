import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { fs } from './support/memfs.js';

window.scrollTo = vi.fn();

class TestEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  close() {
    return undefined;
  }
}

vi.stubGlobal('EventSource', TestEventSource);

const fsPromisesMock = {
  mkdir: fs.promises.mkdir.bind(fs.promises),
  readFile: fs.promises.readFile.bind(fs.promises),
  readdir: fs.promises.readdir.bind(fs.promises),
  rename: fs.promises.rename.bind(fs.promises),
  rm: fs.promises.rm.bind(fs.promises),
  stat: fs.promises.stat.bind(fs.promises),
  writeFile: fs.promises.writeFile.bind(fs.promises)
};

const fsMock = {
  accessSync: fs.accessSync.bind(fs),
  constants: fs.constants,
  watch: vi.fn(() => ({ close: vi.fn() }))
};

vi.mock('node:fs/promises', () => ({
  ...fsPromisesMock,
  default: fsPromisesMock
}));

vi.mock('node:fs', () => ({
  ...fsMock,
  default: fsMock
}));
