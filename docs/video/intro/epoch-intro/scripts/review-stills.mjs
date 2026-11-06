// usage: node stills.mjs <outdir> <sec,sec,...>  — bundle once, render many frames at half scale
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';
const [out, list] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
const composition = await selectComposition({ serveUrl, id: 'EpochIntro' });
for (const s of list.split(',')) {
  const frame = Math.round(parseFloat(s) * 30);
  await renderStill({ composition, serveUrl, frame, output: `${out}/t${s}.png`, scale: 0.5 });
}
console.log('done');
