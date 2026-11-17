// Starts the page (vite) and the recognition server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('\n⚠  ANTHROPIC_API_KEY is not set in this terminal — shapes will not be recognised.');
  console.warn('   Run:  export ANTHROPIC_API_KEY=<your key>   and then  npm start  again.\n');
}
const run = (name, args) => {
  const p = spawn('npx', args, { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => { console.log(`[${name}] stopped (${code})`); process.exit(code ?? 0); });
  return p;
};
const procs = [run('server', ['tsx', 'server/index.ts']), run('page', ['vite'])];
process.on('SIGINT', () => { for (const p of procs) p.kill('SIGINT'); });
