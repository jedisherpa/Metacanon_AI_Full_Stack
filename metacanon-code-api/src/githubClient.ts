import { type GithubFetchResult } from './types.js';

interface GithubSourceConfig {
  owner: string;
  repo: string;
  ref: string;
  token?: string;
}

interface GithubContentResponse {
  content: string;
  encoding: string;
}

interface GithubCommitResponse {
  sha: string;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function fetchFileFromGithub(filePath: string, config: GithubSourceConfig): Promise<GithubFetchResult> {
  const encodedPath = filePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const headers = buildHeaders(config.token);

  const contentUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.ref)}`;

  const contentResponse = await fetch(contentUrl, { headers });
  if (!contentResponse.ok) {
    const body = await contentResponse.text();
    throw new Error(`GitHub content fetch failed (${contentResponse.status}): ${body}`);
  }

  const contentJson = (await contentResponse.json()) as GithubContentResponse;
  if (contentJson.encoding !== 'base64') {
    throw new Error(`Unsupported GitHub content encoding: ${contentJson.encoding}`);
  }

  const content = Buffer.from(contentJson.content.replace(/\n/g, ''), 'base64').toString('utf8');

  const commitUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/commits?path=${encodedPath}&sha=${encodeURIComponent(config.ref)}&per_page=1`;
  const commitResponse = await fetch(commitUrl, { headers });

  let commitSha: string | undefined;
  if (commitResponse.ok) {
    const commits = (await commitResponse.json()) as GithubCommitResponse[];
    commitSha = commits[0]?.sha;
  }

  return {
    content,
    commitSha
  };
}
