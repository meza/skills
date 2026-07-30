/* v8 ignore file -- covered through bootstrap.tsx; this file only launches the browser entrypoint. */
import './styles.css';
import { renderViewer } from './bootstrap.js';

await renderViewer(document.getElementById('root') as HTMLElement);
