import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const thisFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFilePath), '..');

const routeFiles = [
  'engine/src/api/v1/atlasRoutes.ts',
  'engine/src/api/v1/citadelRoutes.ts',
  'engine/src/api/v1/forgeRoutes.ts',
  'engine/src/api/v1/hubRoutes.ts',
  'engine/src/api/v1/engineRoomRoutes.ts'
].map((file) => path.join(repoRoot, file));

const commandCatalogFile = path.join(repoRoot, 'tma/src/lib/commands.ts');

const routeEndpointRegex = /router\.(get|post|patch|put|delete)\('\/api\/v1\/(.*?)'/g;
const commandMethodRegex = /method:\s*'(GET|POST|PATCH|PUT|DELETE)'/g;
const commandPathRegex = /path:\s*'([^']+)'/g;
const commandIdRegex = /id:\s*'([^']+)'/g;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectRouteEndpoints() {
  const endpoints = new Set();

  for (const routeFile of routeFiles) {
    const text = readText(routeFile);
    let match;
    while ((match = routeEndpointRegex.exec(text))) {
      endpoints.add(`${match[1].toUpperCase()} /api/v1/${match[2]}`);
    }
  }

  return endpoints;
}

function collectCommandData() {
  const text = readText(commandCatalogFile);

  const commandIds = [...text.matchAll(commandIdRegex)].map((match) => match[1]);
  const methods = [...text.matchAll(commandMethodRegex)].map((match) => match[1]);
  const paths = [...text.matchAll(commandPathRegex)].map((match) => match[1]);

  const endpoints = new Set();
  for (let index = 0; index < Math.min(methods.length, paths.length); index += 1) {
    endpoints.add(`${methods[index]} ${paths[index]}`);
  }

  return { commandIds, endpoints };
}

function sort(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function main() {
  const routeEndpoints = collectRouteEndpoints();
  const { commandIds, endpoints: commandEndpoints } = collectCommandData();

  const missing = sort([...routeEndpoints].filter((endpoint) => !commandEndpoints.has(endpoint)));
  const unexpected = sort([...commandEndpoints].filter((endpoint) => !routeEndpoints.has(endpoint)));

  const expectedRouteCount = 49;
  const expectedCommandIdCount = 50;

  const routeCountOk = routeEndpoints.size === expectedRouteCount;
  const commandIdCountOk = commandIds.length === expectedCommandIdCount;

  const hasErrors = missing.length > 0 || unexpected.length > 0 || !routeCountOk || !commandIdCountOk;

  if (!routeCountOk) {
    console.error(`[parity] Route endpoint count mismatch. Expected ${expectedRouteCount}, found ${routeEndpoints.size}.`);
  }
  if (!commandIdCountOk) {
    console.error(`[parity] Command ID count mismatch. Expected ${expectedCommandIdCount}, found ${commandIds.length}.`);
  }
  if (missing.length > 0) {
    console.error('[parity] Missing in command catalog:');
    for (const endpoint of missing) console.error(`  - ${endpoint}`);
  }
  if (unexpected.length > 0) {
    console.error('[parity] Unexpected endpoint in command catalog:');
    for (const endpoint of unexpected) console.error(`  - ${endpoint}`);
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`[parity] OK: ${routeEndpoints.size} backend endpoints mapped by ${commandIds.length} command IDs.`);
}

main();
