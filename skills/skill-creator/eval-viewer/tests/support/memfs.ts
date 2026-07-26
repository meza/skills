import type * as nodeFs from 'node:fs';
import { fs as memfs, vol } from 'memfs';

export const fs = memfs as unknown as typeof nodeFs;
export { vol };
