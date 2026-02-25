export type AgentIdentity = {
  did: string;
  label?: string;
  publicKey?: string;
  registeredAt: string;
};

export class DidRegistry {
  private readonly identities = new Map<string, AgentIdentity>();

  register(identity: { did: string; label?: string; publicKey?: string }): AgentIdentity {
    const existing = this.identities.get(identity.did);
    if (existing) {
      return existing;
    }

    const created: AgentIdentity = {
      did: identity.did,
      label: identity.label,
      publicKey: identity.publicKey,
      registeredAt: new Date().toISOString()
    };

    this.identities.set(identity.did, created);
    return created;
  }

  get(did: string): AgentIdentity | null {
    return this.identities.get(did) ?? null;
  }

  has(did: string): boolean {
    return this.identities.has(did);
  }
}
