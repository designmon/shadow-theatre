// Starts the page (vite) and the recognition server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.warn('\n⚠  No recognition key set in this terminal — shapes will not be recognised.');
  console.warn('   Run:  export OPENROUTER_API_KEY=<your OpenRouter key>   (Jev)   and then  npm start  again.\n');
}
const run = (name, args) => {
  const p = spawn('npx', args, { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => { console.log(`[${name}] stopped (${code})`); process.exit(code ?? 0); });
  return p;
};
const procs = [run('server', ['tsx', 'server/index.ts']), run('page', ['vite'])];
process.on('SIGINT', () => { for (const p of procs) p.kill('SIGINT'); });
