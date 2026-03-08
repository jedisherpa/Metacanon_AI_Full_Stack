import { describe, expect, it } from 'vitest';

import { createImapEmailProvider, parseImapCredential } from './imapProvider.js';

describe('imapProvider', () => {
  it('parses imaps URL credential', () => {
    const credential = parseImapCredential('imaps://user%40example.com:pass123@mail.example.com:993/INBOX');
    expect(credential).toEqual({
      host: 'mail.example.com',
      port: 993,
      secure: true,
      user: 'user@example.com',
      pass: 'pass123',
      mailbox: 'INBOX',
      rejectUnauthorized: true
    });
  });

  it('parses imap URL credential with query flags', () => {
    const credential = parseImapCredential(
      'imap://user:pass@mail.example.com:143/Archive?secure=false&rejectUnauthorized=false'
    );
    expect(credential).toEqual({
      host: 'mail.example.com',
      port: 143,
      secure: false,
      user: 'user',
      pass: 'pass',
      mailbox: 'Archive',
      rejectUnauthorized: false
    });
  });

  it('parses JSON credential object', () => {
    const credential = parseImapCredential(
      JSON.stringify({
        host: 'imap.example.com',
        port: 993,
        secure: true,
        user: 'json-user',
        pass: 'json-pass',
        mailbox: 'INBOX'
      })
    );
    expect(credential).toEqual({
      host: 'imap.example.com',
      port: 993,
      secure: true,
      user: 'json-user',
      pass: 'json-pass',
      mailbox: 'INBOX',
      rejectUnauthorized: true
    });
  });

  it('throws on invalid credential', () => {
    expect(() => parseImapCredential('not-a-credential')).toThrowError();
  });

  it('creates provider with injectable parser', async () => {
    const provider = createImapEmailProvider({
      credentialParser: () => ({
        host: 'imap.example.com',
        port: 993,
        secure: true,
        user: 'u',
        pass: 'p',
        mailbox: 'INBOX',
        rejectUnauthorized: true
      })
    });
    expect(provider).toBeDefined();
    expect(typeof provider.fetchInbox).toBe('function');
  });
});
