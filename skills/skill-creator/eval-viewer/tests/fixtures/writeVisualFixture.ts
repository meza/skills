import { resolve } from 'node:path';
import { writeRichEvaluationWorkspace } from './richEvaluation.js';

const root = resolve('.tmp', 'visual-fixture');
await writeRichEvaluationWorkspace(root);
console.log(root);
