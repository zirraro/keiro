/**
 * Execute a multi-line script on the VPS via SSH.
 * Usage: node worker/ssh-exec.mjs <password> <script-file-or-inline>
 */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const HOST = '51.68.226.25';
const PASS = process.argv[2] || '';
const scriptArg = process.argv[3] || '';

let script;
try {
  script = readFileSync(scriptArg, 'utf8');
} catch {
  script = scriptArg;
}

if (!script) { console.error('Usage: node ssh-exec.mjs <password> <script>'); process.exit(1); }

const conn = new Client();
conn.on('ready', () => {
  console.log('✅ Connected to', HOST);
  conn.exec(script, { pty: false }, (err, stream) => {
    if (err) { console.error('Exec error:', err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', (code) => {
      console.log('\n📋 Exit code:', code);
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
}).connect({
  host: HOST,
  port: 22,
  username: 'root',
  password: PASS,
  readyTimeout: 20000,
});
