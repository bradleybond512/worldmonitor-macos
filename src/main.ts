import './styles.css';
import { Terminal } from './terminal.js';

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app element not found');

  const terminal = new Terminal(app);
  await terminal.init();

  // Cleanup on unload
  window.addEventListener('beforeunload', () => terminal.destroy());
}

boot().catch(console.error);
