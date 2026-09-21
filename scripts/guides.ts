import { parseArgs } from 'node:util';
import { buildLibrary, captureSource, readSources, verifyCorpus, writeInventory } from './corpus';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { browser: { type: 'boolean' }, html: { type: 'string' } } });
  const [command, target] = positionals; const root = process.cwd();
  if (command === 'build' && positionals.length === 1 && !values.browser && !values.html) {
    const data = await buildLibrary(root); console.log(`Built ${data.guides.length} local guides (no network).`); return;
  }
  if (command === 'verify' && positionals.length === 1 && !values.browser && !values.html) {
    const errors = await verifyCorpus(root); if (errors.length) throw Error(errors.join('\n'));
    console.log('Verified capture hashes, provenance, anchors, sanitized content, and local assets.'); return;
  }
  if (command !== 'import' || !target || positionals.length !== 2 || (values.browser && values.html) || (target === 'all' && values.html)) throw Error('Usage: pnpm guides:import <id|all> [--browser | --html <path>]');
  const sources = (await readSources(root)).filter(s => target === 'all' || s.id === target);
  if (!sources.length) throw Error(`Unknown source ID: ${target}`);
  let failures = 0;
  for (const source of sources) {
    try {
      let manifest;
      try { manifest = await captureSource(source, { root, browser: values.browser, htmlPath: values.html }); }
      catch (error) {
        if (values.browser || values.html) throw error;
        console.warn(`${source.id}: direct capture failed (${String(error)}); trying browser capture.`);
        manifest = await captureSource(source, { root, browser: true });
      }
      console.log(`${source.id}: saved ${manifest.captureId} via ${manifest.method}; ${manifest.assets.filter(a => a.path).length} images.`);
      for (const warning of manifest.warnings) console.warn(`  ${warning}`);
    } catch (error) { failures++; console.error(`${source.id}: ${String(error)}. Previous successful capture retained.`); }
  }
  await writeInventory(root); await buildLibrary(root);
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
