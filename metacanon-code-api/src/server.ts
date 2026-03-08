import express from 'express';
import { pathToFileURL } from 'node:url';

import { getManifest, getSnippetById, loadCodeMap } from './codeMap.js';
import { fetchFileFromGithub } from './githubClient.js';
import { registerRuntimeRoutes } from './runtimeControl.js';

export type ServerConfig = {
  port?: number;
  githubOwner?: string;
  githubRepo?: string;
  githubRef?: string;
  githubToken?: string;
  controlApiKey?: string;
  commandsModulePath?: string;
};

export function createApp(config: ServerConfig = {}) {
  const app = express();
  const githubOwner = config.githubOwner ?? process.env.GITHUB_OWNER ?? 'YOUR_ORG';
  const githubRepo = config.githubRepo ?? process.env.GITHUB_REPO ?? 'metacanon-core';
  const githubRef = config.githubRef ?? process.env.GITHUB_REF ?? 'main';
  const githubToken = config.githubToken ?? process.env.GITHUB_TOKEN;
  const controlApiKey = config.controlApiKey ?? process.env.CONTROL_API_KEY;
  const commandsModulePath = config.commandsModulePath ?? process.env.METACANON_FFI_NODE_PATH;

  app.use(express.json({ limit: '1mb' }));

  registerRuntimeRoutes(app, {
    controlApiKey,
    commandsModulePath,
  });

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

  return app;
}

export function boot(config: ServerConfig = {}) {
  const port = config.port ?? Number.parseInt(process.env.PORT ?? '8787', 10);
  try {
    loadCodeMap();
  } catch (error) {
    // Fail fast if mapping file is invalid.
    // eslint-disable-next-line no-console
    console.error(`Failed to load code-map.yaml: ${String(error)}`);
    process.exit(1);
  }

  const app = createApp(config);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`metacanon-code-api listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  boot();
}
