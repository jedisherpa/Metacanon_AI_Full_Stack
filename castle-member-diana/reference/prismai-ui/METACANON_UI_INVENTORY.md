# Metacanon UI Inventory

This is the current visual inventory of the AnythingLLM-MetacanonAI frontend.

Related planning docs:
- `METACANON_REDESIGN_CHECKLIST.md`
- `METACANON_FIGMA_PAGE_MAP.md`

Scope counts:
- `frontend/src/pages`: 193 files
- `frontend/src/components`: 213 files
- `frontend/src/media`: 76 files
- `frontend/public`: static public assets, fonts, favicon, manifest, embed widget assets

Anything visually modifiable currently lives in one or more of these places:
- `frontend/src/pages`
- `frontend/src/components`
- `frontend/src/media`
- `frontend/public`
- `frontend/src/index.css`
- `frontend/index.html`

## 1. Global Visual Control Files

These are the highest-leverage files for changing the look and feel of the entire app.

- `frontend/src/index.css`
  - root theme tokens
  - light/dark/cathedral/sanctuary theme values
  - shared typography, colors, spacing, Prism styling
- `frontend/src/App.jsx`
  - global app shell providers
  - error boundary
  - toast container
- `frontend/src/ThemeContext.jsx`
  - global theme provider
- `frontend/src/hooks/useTheme.js`
  - theme registration and theme switching
- `frontend/src/LogoContext.jsx`
  - default and custom logo selection
- `frontend/src/PfpContext.jsx`
  - user avatar/profile image loading
- `frontend/src/PrismContext.jsx`
  - Prism state model: idle, hover, thinking, response, error
- `frontend/index.html`
  - page title
  - meta tags
  - favicon reference
- `frontend/public/*`
  - favicon, manifest, public brand assets, embed widget payloads

## 2. Route-Backed Screens

These are the main screens you can navigate to directly through the router.

- `/`
  - `frontend/src/pages/Main/index.jsx`
  - home shell and default landing into chat/home experience
- `/login`
  - `frontend/src/pages/Login/index.jsx`
- `/sso/simple`
  - `frontend/src/pages/Login/SSO/simple.jsx`
- `/prism-hero`
  - `frontend/src/pages/PrismHero/index.jsx`
  - `frontend/src/pages/PrismHero/index.css`
  - `frontend/src/pages/PrismHero/createPrismHeroScene.js`
- `/prism-dodecahedron`
  - `frontend/src/pages/PrismDodecahedron/index.jsx`
  - `frontend/src/pages/PrismDodecahedron/index.css`
- `/metacanonai`
  - `frontend/src/pages/MetacanonAI/index.jsx`
- `/metacanonai/ui-lab`
  - `frontend/src/pages/MetacanonAILab/index.jsx`
- `/workspace/:slug`
  - `frontend/src/pages/WorkspaceChat/index.jsx`
- `/workspace/:slug/t/:threadSlug`
  - `frontend/src/pages/WorkspaceChat/index.jsx`
- `/workspace/:slug/settings/:tab`
  - `frontend/src/pages/WorkspaceSettings/index.jsx`
- `/accept-invite/:code`
  - `frontend/src/pages/Invite/index.jsx`
- `/onboarding`
  - `frontend/src/pages/OnboardingFlow/index.jsx`
- `/onboarding/:step`
  - `frontend/src/pages/OnboardingFlow/index.jsx`
- `/settings/llm-preference`
  - `frontend/src/pages/GeneralSettings/LLMPreference/index.jsx`
- `/settings/transcription-preference`
  - `frontend/src/pages/GeneralSettings/TranscriptionPreference/index.jsx`
- `/settings/audio-preference`
  - `frontend/src/pages/GeneralSettings/AudioPreference/index.jsx`
- `/settings/embedding-preference`
  - `frontend/src/pages/GeneralSettings/EmbeddingPreference/index.jsx`
- `/settings/text-splitter-preference`
  - `frontend/src/pages/GeneralSettings/EmbeddingTextSplitterPreference/index.jsx`
- `/settings/vector-database`
  - `frontend/src/pages/GeneralSettings/VectorDatabase/index.jsx`
- `/settings/agents`
  - `frontend/src/pages/Admin/Agents/index.jsx`
- `/settings/agents/builder`
  - `frontend/src/pages/Admin/AgentBuilder/index.jsx`
- `/settings/agents/builder/:flowId`
  - `frontend/src/pages/Admin/AgentBuilder/index.jsx`
- `/settings/event-logs`
  - `frontend/src/pages/Admin/Logging/index.jsx`
- `/settings/embed-chat-widgets`
  - `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/index.jsx`
- `/settings/security`
  - `frontend/src/pages/GeneralSettings/Security/index.jsx`
- `/settings/privacy`
  - `frontend/src/pages/GeneralSettings/PrivacyAndData/index.jsx`
- `/settings/interface`
  - `frontend/src/pages/GeneralSettings/Settings/Interface/index.jsx`
- `/settings/branding`
  - `frontend/src/pages/GeneralSettings/Settings/Branding/index.jsx`
- `/settings/default-system-prompt`
  - `frontend/src/pages/Admin/DefaultSystemPrompt/index.jsx`
- `/settings/chat`
  - `frontend/src/pages/GeneralSettings/Settings/Chat/index.jsx`
- `/settings/beta-features`
  - `frontend/src/pages/Admin/ExperimentalFeatures/index.jsx`
- `/settings/api-keys`
  - `frontend/src/pages/GeneralSettings/ApiKeys/index.jsx`
- `/settings/system-prompt-variables`
  - `frontend/src/pages/Admin/SystemPromptVariables/index.jsx`
- `/settings/browser-extension`
  - `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey/index.jsx`
- `/settings/workspace-chats`
  - `frontend/src/pages/GeneralSettings/Chats/index.jsx`
- `/settings/invites`
  - `frontend/src/pages/Admin/Invitations/index.jsx`
- `/settings/users`
  - `frontend/src/pages/Admin/Users/index.jsx`
- `/settings/workspaces`
  - `frontend/src/pages/Admin/Workspaces/index.jsx`
- `/settings/beta-features/live-document-sync/manage`
  - `frontend/src/pages/Admin/ExperimentalFeatures/Features/LiveSync/manage/index.jsx`
- `/settings/community-hub/trending`
  - `frontend/src/pages/GeneralSettings/CommunityHub/Trending/index.jsx`
- `/settings/community-hub/authentication`
  - `frontend/src/pages/GeneralSettings/CommunityHub/Authentication/index.jsx`
- `/settings/community-hub/import-item`
  - `frontend/src/pages/GeneralSettings/CommunityHub/ImportItem/index.jsx`
- `/settings/mobile-connections`
  - `frontend/src/pages/GeneralSettings/MobileConnections/index.jsx`
- `*`
  - `frontend/src/pages/404.jsx`

## 3. Major Screen Families

These directories contain the screen-specific subcomponents that shape the current UI.

- `frontend/src/pages/Main`
- `frontend/src/pages/WorkspaceChat`
- `frontend/src/pages/WorkspaceSettings`
- `frontend/src/pages/GeneralSettings`
- `frontend/src/pages/Admin`
- `frontend/src/pages/Login`
- `frontend/src/pages/Invite`
- `frontend/src/pages/OnboardingFlow`
- `frontend/src/pages/MetacanonAI`
- `frontend/src/pages/MetacanonAILab`
- `frontend/src/pages/PrismHero`
- `frontend/src/pages/PrismDodecahedron`

## 4. Shared Layout Shells, Menus, and Rails

These are the main shared surfaces that determine navigation, menus, and global app framing.

- Main app sidebar
  - `frontend/src/components/Sidebar/index.jsx`
  - `frontend/src/components/Sidebar/SidebarToggle/index.jsx`
  - `frontend/src/components/Sidebar/SearchBox/index.jsx`
  - `frontend/src/components/Sidebar/ActiveWorkspaces/index.jsx`
  - `frontend/src/components/Sidebar/ActiveWorkspaces/ThreadContainer/index.jsx`
  - `frontend/src/components/Sidebar/ActiveWorkspaces/ThreadContainer/ThreadItem/index.jsx`
- Settings sidebar
  - `frontend/src/components/SettingsSidebar/index.jsx`
  - `frontend/src/components/SettingsSidebar/MenuOption/index.jsx`
- Footer dock
  - `frontend/src/components/Footer/index.jsx`
  - current dock includes source/docs/community/custom footer items, MetacanonAI `MC`, and settings/home button
- Settings/home icon button
  - `frontend/src/components/SettingsButton/index.jsx`
- User menu shell
  - `frontend/src/components/UserMenu/index.jsx`
  - `frontend/src/components/UserMenu/UserButton/index.jsx`
  - `frontend/src/components/UserMenu/AccountModal/index.jsx`
- Global wrappers
  - `frontend/src/components/PrivateRoute/index.jsx`
  - `frontend/src/components/ModalWrapper/index.jsx`
  - `frontend/src/components/Preloader.jsx`
  - `frontend/src/components/ErrorBoundaryFallback/index.jsx`
  - `frontend/src/components/KeyboardShortcutsHelp/index.jsx`

## 5. Prism-Specific UI Layer

These files are the custom Metacanon/Prism presentation layer we added.

- `frontend/src/components/PrismPresence/index.jsx`
- `frontend/src/components/PrismHoverTarget/index.jsx`
- `frontend/src/PrismContext.jsx`
- `frontend/src/pages/MetacanonAI/index.jsx`
- `frontend/src/pages/MetacanonAILab/index.jsx`
- `frontend/src/pages/PrismHero/*`
- `frontend/src/pages/PrismDodecahedron/*`

## 6. Chat UI Surfaces

These files control the actual chat experience, including the prompt bar, message history, source sidebars, and message actions.

- Chat page shell
  - `frontend/src/components/WorkspaceChat/index.jsx`
  - `frontend/src/components/WorkspaceChat/LoadingChat/index.jsx`
- Primary chat container
  - `frontend/src/components/WorkspaceChat/ChatContainer/index.jsx`
- Chat history tree
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/ActionMenu/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/DeleteMessage/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/EditMessage/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/RenderMetrics/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/TTSButton/*`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/PromptReply/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/StatusResponse/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ThoughtContainer/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/Citation/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/Chartable/*`
- Prompt composer
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/Attachments/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/AttachItem/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/AttachItem/ParsedFilesMenu/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/*`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/ToolsMenu/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/ToolsMenu/Tabs/AgentSkills/*`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/ToolsMenu/Tabs/SlashCommands/*`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/SpeechToText/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/StopGenerationButton/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/TextSizeMenu/index.jsx`
- Model and source side surfaces
  - `frontend/src/components/WorkspaceChat/ChatContainer/WorkspaceModelPicker/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/SourcesSidebar/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/SourcesSidebar/SourceItem/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/SourcesSidebar/MobileCitationModal/*`
- Drag-and-drop and file upload warning surfaces
  - `frontend/src/components/WorkspaceChat/ChatContainer/DnDWrapper/index.jsx`
  - `frontend/src/components/WorkspaceChat/ChatContainer/DnDWrapper/FileUploadWarningModal/index.jsx`
- General chat adjuncts
  - `frontend/src/components/ChatBubble/index.jsx`
  - `frontend/src/components/EditingChatBubble/index.jsx`
  - `frontend/src/components/DefaultChat/index.jsx`
  - `frontend/src/components/lib/QuickActions/index.jsx`
  - `frontend/src/components/lib/SuggestedMessages/index.jsx`

## 7. Workspace Management and Modals

These files are major visually modifiable dialogs and workspace management surfaces.

- New workspace modal
  - `frontend/src/components/Modals/NewWorkspace.jsx`
- Password/auth modal
  - `frontend/src/components/Modals/Password/index.jsx`
  - `frontend/src/components/Modals/Password/SingleUserAuth.jsx`
  - `frontend/src/components/Modals/Password/MultiUserAuth.jsx`
- Recovery code modal
  - `frontend/src/components/Modals/DisplayRecoveryCodeModal/index.jsx`
- Manage workspace modal system
  - `frontend/src/components/Modals/ManageWorkspace/index.jsx`
  - data connectors: `frontend/src/components/Modals/ManageWorkspace/DataConnectors/*`
  - documents: `frontend/src/components/Modals/ManageWorkspace/Documents/*`
- Invite modal
  - `frontend/src/pages/Invite/NewUserModal/index.jsx`
- Admin user/workspace/invite modals
  - `frontend/src/pages/Admin/Users/NewUserModal/index.jsx`
  - `frontend/src/pages/Admin/Users/UserRow/EditUserModal/index.jsx`
  - `frontend/src/pages/Admin/Invitations/NewInviteModal/index.jsx`
  - `frontend/src/pages/Admin/Workspaces/NewWorkspaceModal/index.jsx`
- API and embed modals
  - `frontend/src/pages/GeneralSettings/ApiKeys/NewApiKeyModal/index.jsx`
  - `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey/NewBrowserExtensionApiKeyModal/index.jsx`
  - `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/NewEmbedModal/index.jsx`
  - `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/EmbedRow/EditEmbedModal/index.jsx`
  - `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/EmbedRow/CodeSnippetModal/index.jsx`
- Workspace member modal
  - `frontend/src/pages/WorkspaceSettings/Members/AddMemberModal/index.jsx`

## 8. Buttons, Toggles, and Button-Like Surfaces

These are the main reusable button and control primitives.

- `frontend/src/components/lib/CTAButton/index.jsx`
- `frontend/src/components/lib/Toggle/index.jsx`
- `frontend/src/components/ContextualSaveBar/index.jsx`
- `frontend/src/components/SettingsButton/index.jsx`
- `frontend/src/components/Sidebar/SidebarToggle/index.jsx`
- `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/StopGenerationButton/index.jsx`
- `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/TextSizeMenu/index.jsx`
- `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/ToolsMenu/index.jsx`
- `frontend/src/components/WorkspaceChat/ChatContainer/WorkspaceModelPicker/index.jsx`

Many page-level buttons also live directly inside these screen directories:
- `frontend/src/pages/GeneralSettings/Settings/components/*`
- `frontend/src/pages/WorkspaceSettings/*`
- `frontend/src/pages/Admin/*`
- `frontend/src/pages/Main/Home/index.jsx`
- `frontend/src/pages/MetacanonAI/index.jsx`
- `frontend/src/pages/MetacanonAILab/index.jsx`

## 9. Settings and Configurator Screen Families

These are major visual/configuration surfaces with their own controls, forms, menus, and lists.

- General settings
  - `frontend/src/pages/GeneralSettings/LLMPreference`
  - `frontend/src/pages/GeneralSettings/AudioPreference`
  - `frontend/src/pages/GeneralSettings/TranscriptionPreference`
  - `frontend/src/pages/GeneralSettings/EmbeddingPreference`
  - `frontend/src/pages/GeneralSettings/EmbeddingTextSplitterPreference`
  - `frontend/src/pages/GeneralSettings/VectorDatabase`
  - `frontend/src/pages/GeneralSettings/Security`
  - `frontend/src/pages/GeneralSettings/PrivacyAndData`
  - `frontend/src/pages/GeneralSettings/ApiKeys`
  - `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey`
  - `frontend/src/pages/GeneralSettings/Chats`
  - `frontend/src/pages/GeneralSettings/ChatEmbedWidgets`
  - `frontend/src/pages/GeneralSettings/MobileConnections`
  - `frontend/src/pages/GeneralSettings/CommunityHub`
  - `frontend/src/pages/GeneralSettings/Settings`
- Branding and interface-specific controls
  - `frontend/src/pages/GeneralSettings/Settings/Interface/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/Branding/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/Chat/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/ThemePreference/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/LanguagePreference/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/CustomAppName/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/CustomLogo/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/CustomMessages/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/CustomSiteSettings/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/FooterCustomization/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/FooterCustomization/NewIconForm/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/SupportEmail/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/SpellCheck/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/ShowScrollbar/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/AutoSpeak/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/AutoSubmit/index.jsx`
  - `frontend/src/pages/GeneralSettings/Settings/components/ChatRenderHTML/index.jsx`

## 10. Workspace Settings Families

These visually configurable workspace-specific panels and child controls exist under:

- `frontend/src/pages/WorkspaceSettings/index.jsx`
- `frontend/src/pages/WorkspaceSettings/GeneralAppearance/*`
- `frontend/src/pages/WorkspaceSettings/ChatSettings/*`
- `frontend/src/pages/WorkspaceSettings/AgentConfig/*`
- `frontend/src/pages/WorkspaceSettings/Members/*`
- `frontend/src/pages/WorkspaceSettings/VectorDatabase/*`

These include:
- workspace name
- suggested chat messages
- delete workspace
- chat history settings
- chat mode selection
- prompt settings and prompt history
- refusal response
- chat temperature
- workspace LLM selection
- agent model/LLM selection
- member list and add member modal
- vector thresholds, snippet limits, reset database, search mode, identifier

## 11. Admin Screen Families

These are visually modifiable admin surfaces:

- `frontend/src/pages/Admin/Agents/*`
- `frontend/src/pages/Admin/AgentBuilder/*`
- `frontend/src/pages/Admin/DefaultSystemPrompt/*`
- `frontend/src/pages/Admin/ExperimentalFeatures/*`
- `frontend/src/pages/Admin/Invitations/*`
- `frontend/src/pages/Admin/Logging/*`
- `frontend/src/pages/Admin/SystemPromptVariables/*`
- `frontend/src/pages/Admin/Users/*`
- `frontend/src/pages/Admin/Workspaces/*`

Important visual/admin interaction subgroups:
- agent skills panels
- imported skills and MCP panels
- agent flows
- SQL connector selector
- web search provider selector
- node-based agent builder graph/editor
- invite/user/workspace rows and edit modals
- event log tables
- system prompt variable list and edit modal

## 12. Provider, Connector, and Model Selection Surfaces

These are all visually modifiable selection grids, cards, rows, and option panes:

- LLM providers
  - `frontend/src/components/LLMSelection/*`
- Embedding providers
  - `frontend/src/components/EmbeddingSelection/*`
- Vector database providers
  - `frontend/src/components/VectorDBSelection/*`
- TTS providers
  - `frontend/src/components/TextToSpeech/*`
- Transcription providers
  - `frontend/src/components/TranscriptionSelection/*`
- Data connector surfaces
  - `frontend/src/components/DataConnectorOption/*`
  - `frontend/src/components/Modals/ManageWorkspace/DataConnectors/*`

## 13. Current Asset Inventory

### A. Main `src/media` assets

#### `frontend/src/media/agents`
- `generate-charts.png`
- `generate-save-files.png`
- `mcp-logo.svg`
- `rag-memory.png`
- `scrape-websites.png`
- `sql-agent.png`
- `view-summarize.png`

#### `frontend/src/media/animations`
- `agent-animation.webm`
- `agent-static.png`
- `thinking-animation.webm`
- `thinking-static.png`

#### `frontend/src/media/announcements`
- `placeholder-1.png`
- `placeholder-2.png`
- `placeholder-3.png`

#### `frontend/src/media/dataConnectors`
- `confluence.png`
- `drupalwiki.png`
- `obsidian.png`
- `paperlessngx.png`

#### `frontend/src/media/embeddingprovider`
- `voyageai.png`

#### `frontend/src/media/illustrations`
- `community-hub.png`
- `login-logo-light.svg`
- `login-logo.svg`

#### `frontend/src/media/llmprovider`
- `anthropic.png`
- `apipie.png`
- `azure.png`
- `bedrock.png`
- `cohere.png`
- `cometapi.png`
- `deepseek.png`
- `docker-model-runner.png`
- `dpais.png`
- `fireworksai.jpeg`
- `foundry-local.png`
- `gemini.png`
- `generic-openai.png`
- `giteeai.png`
- `groq.png`
- `huggingface.png`
- `koboldcpp.png`
- `lemonade.png`
- `litellm.png`
- `lmstudio.png`
- `localai.png`
- `mistral.jpeg`
- `moonshotai.png`
- `novita.png`
- `nvidia-nim.png`
- `ollama.png`
- `openai.png`
- `openrouter.jpeg`
- `perplexity.png`
- `ppio.png`
- `privatemode.png`
- `sambanova.png`
- `text-generation-webui.png`
- `togetherai.png`
- `xai.png`
- `zai.png`

#### `frontend/src/media/logo`
- `anything-llm-dark.png`
- `anything-llm-icon.png`
- `anything-llm-infinity.png`
- `anything-llm.png`
- `anythingllm-metacanonai-dark.svg`
- `anythingllm-metacanonai-light.svg`

#### `frontend/src/media/ttsproviders`
- `elevenlabs.png`
- `generic-openai.png`
- `piper.png`

#### `frontend/src/media/vectordbs`
- `astraDB.png`
- `chroma.png`
- `lancedb.png`
- `milvus.png`
- `pgvector.png`
- `pinecone.png`
- `qdrant.png`
- `weaviate.png`
- `zilliz.png`

### B. Public assets

#### `frontend/public`
- `anything-llm-dark.png`
- `anything-llm-light.png`
- `favicon.ico`
- `favicon.png`
- `manifest.json`
- `robots.txt`

#### `frontend/public/fonts`
- `PlusJakartaSans.ttf`

#### `frontend/public/embed`
- `anythingllm-chat-widget.min.css`
- `anythingllm-chat-widget.min.js`

#### `frontend/public/service-workers`
- `push-notifications.js`

### C. Page-specific and component-specific visual assets

#### Onboarding art
- `frontend/src/pages/OnboardingFlow/Steps/Home/l_group-light.png`
- `frontend/src/pages/OnboardingFlow/Steps/Home/l_group.png`
- `frontend/src/pages/OnboardingFlow/Steps/Home/r_group-light.png`
- `frontend/src/pages/OnboardingFlow/Steps/Home/r_group.png`

#### Mobile connections
- `frontend/src/pages/GeneralSettings/MobileConnections/ConnectionModal/bg.png`
- `frontend/src/pages/GeneralSettings/MobileConnections/ConnectionModal/gplay-badge.svg`

#### Admin SQL connector icons
- `frontend/src/pages/Admin/Agents/SQLConnectorSelection/icons/mssql.png`
- `frontend/src/pages/Admin/Agents/SQLConnectorSelection/icons/mysql.png`
- `frontend/src/pages/Admin/Agents/SQLConnectorSelection/icons/postgresql.png`

#### Admin web search icons
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/bing.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/duckduckgo.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/exa.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/searchapi.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/searxng.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/serpapi.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/serper.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/serply.png`
- `frontend/src/pages/Admin/Agents/WebSearchSelection/icons/tavily.svg`

#### Data connector option media
- `frontend/src/components/DataConnectorOption/media/confluence.jpeg`
- `frontend/src/components/DataConnectorOption/media/drupalwiki.jpg`
- `frontend/src/components/DataConnectorOption/media/github.svg`
- `frontend/src/components/DataConnectorOption/media/gitlab.svg`
- `frontend/src/components/DataConnectorOption/media/link.svg`
- `frontend/src/components/DataConnectorOption/media/obsidian.png`
- `frontend/src/components/DataConnectorOption/media/paperless-ngx.jpeg`
- `frontend/src/components/DataConnectorOption/media/youtube.svg`

#### User icons and chat utility assets
- `frontend/src/components/UserIcon/user.svg`
- `frontend/src/components/UserIcon/workspace.svg`
- `frontend/src/components/WorkspaceChat/ChatContainer/DnDWrapper/dnd-icon.png`
- `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/StopGenerationButton/stop.svg`

## 14. Practical Definition of "Everything Visually Modifiable"

If you want to redesign the current UI, the real working surface is:
- all route files in `frontend/src/main.jsx`
- all JSX/CSS under `frontend/src/pages`
- all shared surface components under `frontend/src/components`
- all theme tokens in `frontend/src/index.css`
- all logos/media in `frontend/src/media` and `frontend/public`

For design collaboration, the highest-value files to touch first are:
- `frontend/src/index.css`
- `frontend/src/components/Sidebar/index.jsx`
- `frontend/src/components/SettingsSidebar/index.jsx`
- `frontend/src/components/Footer/index.jsx`
- `frontend/src/components/WorkspaceChat/ChatContainer/index.jsx`
- `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/index.jsx`
- `frontend/src/pages/Main/Home/index.jsx`
- `frontend/src/pages/MetacanonAI/index.jsx`
- `frontend/src/pages/MetacanonAILab/index.jsx`
- `frontend/src/pages/GeneralSettings/Settings/Branding/index.jsx`
- `frontend/src/pages/GeneralSettings/Settings/Interface/index.jsx`
