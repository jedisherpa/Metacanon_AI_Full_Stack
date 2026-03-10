import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const thisFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFilePath), '..');

const runtimeRoutesPath = path.join(repoRoot, 'engine/src/api/v1/runtimeRoutes.ts');
const fallbackBridgeContractPath = path.join(
  repoRoot,
  'contracts/runtime-bridge/commands.contract.js'
);

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function unique(values) {
  return [...new Set(values)];
}

function findFirstExistingFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractTypeBody(text, typeName) {
  const marker = `type ${typeName} = {`;
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Could not locate ${typeName} declaration in runtime routes.`);
  }

  const start = text.indexOf('{', markerIndex);
  if (start < 0) {
    throw new Error(`Could not parse ${typeName} opening brace.`);
  }

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return text.slice(start + 1, index);
    }
  }

  throw new Error(`Could not parse ${typeName} closing brace.`);
}

function extractCreateCommandsReturnBody(text) {
  const fnMarker = 'function createInstallerWebappCommands';
  const fnIndex = text.indexOf(fnMarker);
  if (fnIndex < 0) {
    throw new Error('Could not locate createInstallerWebappCommands in bridge commands file.');
  }

  const returnIndex = text.indexOf('return {', fnIndex);
  if (returnIndex < 0) {
    throw new Error('Could not locate return object for createInstallerWebappCommands.');
  }

  const start = text.indexOf('{', returnIndex);
  if (start < 0) {
    throw new Error('Could not parse createInstallerWebappCommands return object opening brace.');
  }

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return text.slice(start + 1, index);
    }
  }

  throw new Error('Could not parse createInstallerWebappCommands return object closing brace.');
}

function splitTopLevelComma(text) {
  const values = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inSingle) {
      if (char === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      if (char === '"') inDouble = false;
      continue;
    }

    if (inTemplate) {
      if (char === '`') inTemplate = false;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      continue;
    }
    if (char === '`') {
      inTemplate = true;
      continue;
    }

    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth -= 1;
    else if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth -= 1;
    else if (char === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      values.push(text.slice(start, index));
      start = index + 1;
    }
  }

  values.push(text.slice(start));
  return values.map((value) => value.trim()).filter(Boolean);
}

function parseTsMethodSignatures(typeBodyText) {
  const signatures = new Map();
  const methodRegex = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([\s\S]*?)\)\s*:\s*[^;]+;/gm;

  for (const match of typeBodyText.matchAll(methodRegex)) {
    const name = match[1];
    const paramsRaw = match[2]?.trim() ?? '';
    const params = paramsRaw.length === 0 ? [] : splitTopLevelComma(paramsRaw);

    let minArity = 0;
    let maxArity = 0;
    for (const param of params) {
      if (param.startsWith('...')) {
        continue;
      }

      const parsed = /^([A-Za-z_$][A-Za-z0-9_$]*)(\?)?\s*:/.exec(param);
      if (!parsed) {
        continue;
      }

      maxArity += 1;
      if (parsed[2] !== '?') {
        minArity += 1;
      }
    }

    signatures.set(name, {
      minArity,
      maxArity
    });
  }

  return signatures;
}

function parseJsMethodSignatures(objectBodyText) {
  const signatures = new Map();
  const methodRegex = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([\s\S]*?)\)\s*\{/gm;

  for (const match of objectBodyText.matchAll(methodRegex)) {
    const name = match[1];
    const paramsRaw = match[2]?.trim() ?? '';
    const params = paramsRaw.length === 0 ? [] : splitTopLevelComma(paramsRaw);

    let minArity = 0;
    let maxArity = 0;

    for (const param of params) {
      if (param.startsWith('...')) {
        continue;
      }

      maxArity += 1;
      if (!param.includes('=')) {
        minArity += 1;
      }
    }

    signatures.set(name, {
      minArity,
      maxArity
    });
  }

  return signatures;
}

function collectRuntimeBridgeCallSites(runtimeRoutesText) {
  const used = new Set();
  const usageRegex = /bridge\.commands\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  for (const match of runtimeRoutesText.matchAll(usageRegex)) {
    used.add(match[1]);
  }
  return used;
}

function sort(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function main() {
  const runtimeRoutesText = readText(runtimeRoutesPath);
  const explicitPathRaw = process.env.METACANON_BRIDGE_COMMANDS_PATH?.trim();
  const explicitPath =
    explicitPathRaw && !path.isAbsolute(explicitPathRaw)
      ? path.resolve(repoRoot, explicitPathRaw)
      : explicitPathRaw || null;

  const bridgeCandidates = unique([
    explicitPath,
    path.resolve(repoRoot, '../ffi-node/commands.js'),
    path.resolve(repoRoot, 'ffi-node/commands.js'),
    fallbackBridgeContractPath
  ].filter(Boolean));

  const bridgeCommandsPath = findFirstExistingFile(bridgeCandidates);
  if (!bridgeCommandsPath) {
    console.error('[bridge-parity] Could not locate bridge commands module.');
    console.error('[bridge-parity] Checked candidates:');
    for (const candidate of bridgeCandidates) {
      console.error(`  - ${candidate}`);
    }
    process.exit(1);
  }

  const bridgeCommandsText = readText(bridgeCommandsPath);
  const runtimeTypeBody = extractTypeBody(runtimeRoutesText, 'RuntimeBridgeCommands');
  const bridgeReturnBody = extractCreateCommandsReturnBody(bridgeCommandsText);

  const runtimeSignatures = parseTsMethodSignatures(runtimeTypeBody);
  const bridgeSignatures = parseJsMethodSignatures(bridgeReturnBody);
  const runtimeUsedMethods = collectRuntimeBridgeCallSites(runtimeRoutesText);

  const runtimeMethods = new Set(runtimeSignatures.keys());
  const bridgeMethods = new Set(bridgeSignatures.keys());

  const usageMissingInType = sort(
    [...runtimeUsedMethods].filter((method) => !runtimeMethods.has(method))
  );
  const missingInBridge = sort(
    [...runtimeMethods].filter((method) => !bridgeMethods.has(method))
  );
  const extraInBridge = sort(
    [...bridgeMethods].filter((method) => !runtimeMethods.has(method))
  );

  const signatureMismatches = [];
  for (const method of sort([...runtimeMethods].filter((name) => bridgeMethods.has(name)))) {
    const runtimeSig = runtimeSignatures.get(method);
    const bridgeSig = bridgeSignatures.get(method);
    if (!runtimeSig || !bridgeSig) {
      continue;
    }

    if (
      runtimeSig.minArity !== bridgeSig.minArity ||
      runtimeSig.maxArity !== bridgeSig.maxArity
    ) {
      signatureMismatches.push({
        method,
        runtime: runtimeSig,
        bridge: bridgeSig
      });
    }
  }

  const hasErrors =
    usageMissingInType.length > 0 || missingInBridge.length > 0 || signatureMismatches.length > 0;

  console.log(`[bridge-parity] Runtime routes: ${runtimeRoutesPath}`);
  console.log(`[bridge-parity] Bridge commands: ${bridgeCommandsPath}`);

  if (usageMissingInType.length > 0) {
    console.error('[bridge-parity] Runtime bridge calls missing from RuntimeBridgeCommands type:');
    for (const method of usageMissingInType) {
      console.error(`  - ${method}`);
    }
  }

  if (missingInBridge.length > 0) {
    console.error('[bridge-parity] Methods required by RuntimeBridgeCommands but missing in bridge module:');
    for (const method of missingInBridge) {
      console.error(`  - ${method}`);
    }
  }

  if (signatureMismatches.length > 0) {
    console.error('[bridge-parity] Method signature arity mismatches:');
    for (const mismatch of signatureMismatches) {
      console.error(
        `  - ${mismatch.method}: runtime min/max ${mismatch.runtime.minArity}/${mismatch.runtime.maxArity}, bridge min/max ${mismatch.bridge.minArity}/${mismatch.bridge.maxArity}`
      );
    }
  }

  if (extraInBridge.length > 0) {
    console.log('[bridge-parity] Bridge-only methods (allowed, informational):');
    for (const method of extraInBridge) {
      console.log(`  - ${method}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(
    `[bridge-parity] OK: ${runtimeMethods.size} required runtime bridge methods validated against bridge module (${bridgeMethods.size} methods available).`
  );
}

main();
