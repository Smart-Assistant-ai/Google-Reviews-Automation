// The last step of `pnpm build`: writes the public pages listed in src/prerender.tsx into dist.
// Each one is the app's own index.html with that page already rendered inside it, so it reads
// without JavaScript, and the app takes over as usual once its script loads.
import { readFile, rm, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const server = new URL('../dist-ssr/', import.meta.url);
const EMPTY_ROOT = '<div id="root"></div>';

const { PAGES, render } = await import(new URL('prerender.js', server).href);
const shell = await readFile(new URL('index.html', dist), 'utf8');
if (!shell.includes(EMPTY_ROOT)) throw new Error(`dist/index.html has no ${EMPTY_ROOT} to fill`);

for (const [path, file] of Object.entries(PAGES)) {
  const page = render(path);
  // A page with no heading is a loading spinner or an error, not the page itself.
  if (!page.includes('<h1')) throw new Error(`${path} rendered without a heading`);
  // A function, so a "$" in the page is never read as a replacement pattern.
  await writeFile(
    new URL(file, dist),
    shell.replace(EMPTY_ROOT, () => `<div id="root">${page}</div>`),
  );
  console.log(`Prerendered ${path} as dist/${file}`);
}

await rm(server, { recursive: true, force: true });
