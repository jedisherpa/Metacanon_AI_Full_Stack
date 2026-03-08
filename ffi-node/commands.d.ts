import type {
  ComputeOption,
  GenesisRiteRequest,
  GenesisRiteResult,
  MetaCanonClient,
  MetaCanonNativeBridge,
  WillVector,
} from "./client";

export interface CreateCommandsOptions {
  client?: MetaCanonClient;
  nativeBridge?: MetaCanonNativeBridge;
}

export interface CreateTaskSubSpherePayload {
  name: string;
  objective: string;
  hitl_required: boolean;
}

export interface AgentBindingPayload {
  agent_id: string;
  telegram_chat_id?: string | null;
  discord_thread_id?: string | null;
  in_app_thread_id?: string | null;
  is_orchestrator?: boolean;
}

export interface SubSpherePrismBindingPayload {
  sub_sphere_id: string;
  prism_agent_id: string;
  telegram_chat_id?: string | null;
  discord_thread_id?: string | null;
  in_app_thread_id?: string | null;
}

export interface DispatchPayload {
  platform: "telegram" | "discord" | "in_app";
  message: string;
}

export interface SendAgentMessagePayload extends DispatchPayload {
  agent_id: string;
}

export interface SendSubSpherePrismMessagePayload extends DispatchPayload {
  sub_sphere_id: string;
}

export interface InstallerWebappCommands {
  raw: MetaCanonClient;
  logEvent(traceId: string, eventType: string, payload: unknown): string;
  getCodeSnippet(filePath: string, startLine: number, endLine: number): string;
  getWillVector(soulFile: Record<string, unknown>): WillVector;
  updateSoulFile(
    soulFile: Record<string, unknown>,
    patch: Record<string, unknown>,
    signingSecret: string
  ): Record<string, unknown>;
  getComputeOptions(): ComputeOption[];
  setGlobalComputeProvider(providerId: string): Record<string, unknown>;
  setProviderPriority(cloudProviderPriority: string[]): Record<string, unknown>;
  updateProviderConfig(providerId: string, config: Record<string, unknown>): Record<string, unknown>;
  invokeGenesisRite(request: GenesisRiteRequest): GenesisRiteResult;
  validateAction(action: Record<string, unknown>, willVector: WillVector): boolean;
  createTaskSubSphere(payload: CreateTaskSubSpherePayload): Record<string, unknown>;
  getSubSphereList(): Record<string, unknown>[];
  getSubSphereStatus(subSphereId: string): Record<string, unknown>;
  pauseSubSphere(subSphereId: string): Record<string, unknown>;
  dissolveSubSphere(subSphereId: string, reason: string): Record<string, unknown>;
  submitSubSphereQuery(
    subSphereId: string,
    query: string,
    providerOverride?: string | null
  ): Record<string, unknown>;
  updateTelegramIntegration(config: Record<string, unknown>): Record<string, unknown>;
  updateDiscordIntegration(config: Record<string, unknown>): Record<string, unknown>;
  bindAgentCommunicationRoute(payload: AgentBindingPayload): Record<string, unknown>;
  bindSubSpherePrismRoute(payload: SubSpherePrismBindingPayload): Record<string, unknown>;
  sendAgentMessage(payload: SendAgentMessagePayload): Record<string, unknown>;
  sendSubSpherePrismMessage(payload: SendSubSpherePrismMessagePayload): Record<string, unknown>;
  getCommunicationStatus(): Record<string, unknown>;
}

export function createInstallerWebappCommands(
  options?: CreateCommandsOptions
): InstallerWebappCommands;
