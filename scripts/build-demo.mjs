import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['index.html', 'app.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const output = path.join(root, 'demo-dist');
await fs.mkdir(output, { recursive: true });
// Never package the project root: it contains personal reference assets and legacy outputs.
const extras = (await fs.readdir(output)).filter(name => !files.includes(name) && name !== 'SHA256SUMS.txt');
if (extras.length) throw new Error('Unexpected files in demo-dist; review them before building: ' + extras.join(', '));
const hashes = [];
for (const name of files) {
  const source = await fs.readFile(path.join(root, 'demo', name));
  await fs.writeFile(path.join(output, name), source);
  hashes.push(`${createHash('sha256').update(source).digest('hex')}  ${name}`);
}
await fs.writeFile(path.join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
console.log(`Built ${files.length} demo assets in ${output}`);
