import { Client } from 'ssh2';
const conn = new Client();
const HOST = '51.68.226.25';
const PASS = process.argv[2] || '5BS4LyXgVZhC';
const CMD = process.argv[3] || 'whoami && hostname && cat /etc/os-release | head -3';

conn.on('ready', () => {
  console.log('✅ CONNECTED to', HOST);
  conn.exec(CMD, (err, stream) => {
    if (err) { console.error('exec error:', err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).on('error', (err) => {
  console.error('❌ Connection failed:', err.message);
}).connect({
  host: HOST,
  port: 22,
  username: 'root',
  password: PASS,
  readyTimeout: 15000,
});
