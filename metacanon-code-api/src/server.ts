import express from 'express';

import { getManifest, getSnippetById, loadCodeMap } from './codeMap.js';
import { fetchFileFromGithub } from './githubClient.js';

const app = express();

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const githubOwner = process.env.GITHUB_OWNER ?? 'YOUR_ORG';
const githubRepo = process.env.GITHUB_REPO ?? 'metacanon-core';
const githubRef = process.env.GITHUB_REF ?? 'main';
const githubToken = process.env.GITHUB_TOKEN;

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/v1/manifest', (_req, res) => {
  try {
    const manifest = getManifest();
    res.json({
      repo: githubRepo,
      branch: githubRef,
      snippets: manifest
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/v1/snippet/:id', async (req, res) => {
  try {
    const snippet = getSnippetById(req.params.id);
    if (!snippet) {
      res.status(404).json({ error: `Unknown snippet id: ${req.params.id}` });
      return;
    }

    const githubFile = await fetchFileFromGithub(snippet.file, {
      owner: githubOwner,
      repo: githubRepo,
      ref: githubRef,
      token: githubToken
    });

    const lines = githubFile.content.split(/\r?\n/);
    const startIndex = Math.max(0, snippet.start_line - 1);
    const endIndex = Math.min(lines.length, snippet.end_line);

    if (startIndex >= lines.length || startIndex >= endIndex) {
      res.status(422).json({
        error: `Invalid line range ${snippet.start_line}-${snippet.end_line} for ${snippet.file}`
      });
      return;
    }

    const code = lines.slice(startIndex, endIndex).join('\n');

    res.json({
      ...snippet,
      code,
      repo: githubRepo,
      branch: githubRef,
      commit_sha: githubFile.commitSha
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

function boot() {
  try {
    loadCodeMap();
  } catch (error) {
    // Fail fast if mapping file is invalid.
    // eslint-disable-next-line no-console
    console.error(`Failed to load code-map.yaml: ${String(error)}`);
    process.exit(1);
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`metacanon-code-api listening on http://localhost:${port}`);
  });
}

boot();
