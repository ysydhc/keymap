/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Tools Directory - Absolute path(s) to tool JSONs. ⚠️ Use comma (,) to separate multiple paths. */
  "toolsDir": string,
  /** Books Directory - Absolute path(s) to book JSONs. ⚠️ Use comma (,) to separate multiple paths. */
  "booksDir": string,
  /** AI Task Timeout (Seconds) - How long before an active AI task is considered timed out and removed. */
  "aiTaskTimeoutSeconds": string,
  /** Remote Tools URLs - Comma-separated URLs to remote JSON tool libraries (e.g., https://raw.github.../team.json) */
  "remoteToolsUrls": string,
  /** Context App Mappings - JSON mapping of App Name to tags (e.g., {"code": ["node", "git"], "iterm2": ["docker"]}) */
  "contextAppMappings": string,
  /** Favorite Directories - Comma-separated paths to show in the file browser dropdown. */
  "favoriteDirs": string,
  /** Default Shell (Silent Mode) - Absolute path to the shell used for silent execution. Leave empty to use system default. */
  "defaultShell": string,
  /** Global Environment Variables - JSON string of global variables to replace {{env.VAR_NAME}} in commands. */
  "globalEnvVars": string,
  /** Scripts Directory - Absolute path(s) to custom dynamic scripts. ⚠️ Use comma (,) to separate multiple paths. */
  "scriptsDir": string,
  /** AI Trigger Prefix - Character to trigger AI mode (e.g., @) */
  "aiTriggerPrefix": string,
  /** AI Base URL - OpenAI-compatible API Base URL (e.g., http://localhost:11434/v1 for Ollama) */
  "aiBaseUrl": string,
  /** AI API Key - API Key for the AI service (leave empty for local Ollama) */
  "aiApiKey"?: string,
  /** AI Model - Model name (e.g., gpt-4o, llama3) */
  "aiModel": string,
  /** Fallback AI Base URL - Base URL for fallback AI (used after 2 failures) */
  "fallbackAiBaseUrl": string,
  /** Fallback AI API Key - API Key for the fallback AI service */
  "fallbackAiApiKey"?: string,
  /** Fallback AI Model - Fallback Model name (e.g., o1-preview, claude-3.5-sonnet) */
  "fallbackAiModel": string,
  /** AI History Retention (Days) - Number of days to keep AI query history */
  "aiHistoryRetentionDays": string,
  /** AI History Display Count - Number of AI history items to show on the main screen */
  "aiHistoryDisplayCount": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `km` command */
  export type Km = ExtensionPreferences & {}
  /** Preferences accessible in the `kb` command */
  export type Kb = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `km` command */
  export type Km = {
  /** Search... */
  "query": string
}
  /** Arguments passed to the `kb` command */
  export type Kb = {
  /** Search... */
  "query": string
}
}


