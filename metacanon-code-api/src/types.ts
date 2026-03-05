import { z } from 'zod';

export const codeSnippetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  constitutional_basis: z.string().min(1),
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  how_it_works: z.string().min(1)
});

export const codeMapSchema = z.object({
  snippets: z.array(codeSnippetSchema)
});

export type CodeSnippet = z.infer<typeof codeSnippetSchema>;

export type SnippetManifestEntry = Omit<CodeSnippet, 'how_it_works'> & {
  how_it_works: string;
};

export interface SnippetResponse extends CodeSnippet {
  code: string;
  repo: string;
  branch: string;
  commit_sha?: string;
}

export interface GithubFetchResult {
  content: string;
  commitSha?: string;
}
