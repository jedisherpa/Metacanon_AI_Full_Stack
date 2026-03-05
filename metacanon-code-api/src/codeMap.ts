import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import { codeMapSchema, type CodeSnippet } from './types.js';

const codeMapPath = path.resolve(process.cwd(), 'code-map.yaml');

let cachedSnippets: CodeSnippet[] | null = null;

export function loadCodeMap(forceReload = false): CodeSnippet[] {
  if (cachedSnippets && !forceReload) {
    return cachedSnippets;
  }

  const raw = fs.readFileSync(codeMapPath, 'utf8');
  const parsed = yaml.load(raw);
  const map = codeMapSchema.parse(parsed);

  cachedSnippets = map.snippets;
  return map.snippets;
}

export function getSnippetById(id: string): CodeSnippet | undefined {
  return loadCodeMap().find((snippet) => snippet.id === id);
}

export function getManifest() {
  return loadCodeMap().map((snippet) => ({
    id: snippet.id,
    title: snippet.title,
    subtitle: snippet.subtitle,
    constitutional_basis: snippet.constitutional_basis,
    file: snippet.file,
    start_line: snippet.start_line,
    end_line: snippet.end_line,
    how_it_works: snippet.how_it_works
  }));
}
