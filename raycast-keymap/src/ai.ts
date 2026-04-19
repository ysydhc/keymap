import { getPreferenceValues } from "@raycast/api";
import { Tool } from "./types";

export interface AIPreferences {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  fallbackAiBaseUrl: string;
  fallbackAiApiKey: string;
  fallbackAiModel: string;
  aiHistoryRetentionDays: string;
  aiHistoryDisplayCount: string;
  aiTaskTimeoutSeconds: string;
  remoteToolsUrls: string;
  scriptsDir: string;
  aiTriggerPrefix: string;
}

export const SYSTEM_PROMPT = `
You are an expert CLI assistant. The user will describe a command they want to execute.
You must return ONLY a valid JSON object representing the command, matching the following TypeScript interface.
DO NOT wrap the JSON in markdown code blocks (like \`\`\`json). Just return the raw JSON string.

interface ParamOption {
  title: string;
  value: string;
}

interface ParamCondition {
  paramId: string;
  includes?: string[];
  excludes?: string[];
}

interface Param {
  id: string; // e.g., "flags", "branch", "commit"
  type: string; // "string", "flags", "file", "directory", or "multiselect"
  description: string; // Chinese description
  optional?: boolean;
  options?: ParamOption[]; // For predefined choices
  dynamic?: string; // e.g., "git_branches", "docker_containers", "file_path"
  showIf?: ParamCondition;
  requiredIf?: ParamCondition;
}

interface Tool {
  id: string; // Unique ID, e.g., "git-reset-soft"
  title: string; // Chinese title, e.g., "软撤销上一次提交"
  action: string; // Short Chinese action description
  keys?: string; // e.g., "终端：git reset"
  mode: string; // Always "cli"
  keyword: string; // Short Chinese keyword
  aliases: string[]; // Array of aliases
  tags: string[]; // e.g., ["git", "历史"]
  cmd: string; // The actual command template, e.g., "git reset {flags} {commit}"
  weight: number; // Usually 5
  params?: Param[]; // Array of parameters used in cmd
}

Rules:
1. Always use Chinese for titles and descriptions.
2. If the command takes variables, use curly braces in 'cmd' (e.g., {branch}) and define them in 'params'.
3. Set 'mode': 'cli'.
4. Ensure the JSON is perfectly valid.
5. CRITICAL: The generated command MUST be accurate, syntactically correct, and safe to run. Double-check flags and syntax.
6. If this is a retry due to an error, pay close attention to the user's feedback and correct the mistake.
7. For file paths and directory paths, ALWAYS use type: "file" or type: "directory". This enables the native file picker.
8. For multiple files, use type: "multiselect" and dynamic: "file_path".
9. For general text input, use type: "string". For flags, use type: "flags".
`;

export const WEB_SYSTEM_PROMPT = `
You are an expert CLI assistant with access to the latest information. The user will describe a command they want to execute or ask a question about CLI tools.
Your task is to provide the MOST UP-TO-DATE and ACCURATE information possible.
CRITICAL INSTRUCTION: You MUST use your web search capabilities (if available) to verify the exact syntax, flags, and parameters of the command before answering. Do not rely solely on your training data, as CLI tools update frequently.

You must return a detailed Markdown summary of the command usage, syntax, and examples based on your web search.
DO NOT return JSON. Return a clear, well-formatted Markdown document.
Use Chinese for your explanations. Include code blocks for commands.
`;

export async function generateCommandFromAI(
  query: string,
  isWebMode: boolean = false,
  history: { role: string; content: string }[] = [],
  failCount: number = 0
): Promise<{ tool: Tool; newHistory: { role: string; content: string }[] }> {
  const prefs = getPreferenceValues<AIPreferences>();
  
  const useFallback = failCount >= 2;
  const baseUrl = (useFallback && prefs.fallbackAiBaseUrl) ? prefs.fallbackAiBaseUrl : (prefs.aiBaseUrl || "https://api.openai.com/v1");
  const apiKey = (useFallback && prefs.fallbackAiApiKey) ? prefs.fallbackAiApiKey : (prefs.aiApiKey || "");
  const model = (useFallback && prefs.fallbackAiModel) ? prefs.fallbackAiModel : (prefs.aiModel || "gpt-4o");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const prompt = isWebMode ? WEB_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const messages = [
    { role: "system", content: prompt },
    ...history
  ];

  if (history.length === 0) {
    messages.push({ role: "user", content: `I need a command for: ${query}` });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  const content = data.choices[0].message.content.trim();
  
  let jsonStr = content;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const tool = JSON.parse(jsonStr) as Tool;
    tool.id = `ai-generated-${Date.now()}`;
    tool.category = "custom";
    
    const newHistory = [
      ...messages.filter(m => m.role !== "system"),
      { role: "assistant", content: content }
    ];

    return { tool, newHistory };
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${jsonStr}`);
  }
}

export async function modifyCommandWithAI(currentJson: string, prompt: string): Promise<Tool> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const systemPrompt = `You are an expert CLI configuration assistant.
The user wants to modify an existing tool JSON configuration based on their request.
Return ONLY the updated valid JSON object representing the tool.
DO NOT wrap the JSON in markdown code blocks (like \`\`\`json). Just return the raw JSON string.
Ensure the JSON strictly follows the Tool interface.`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Current JSON:\n${currentJson}\n\nModification Request: ${prompt}` }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  const content = data.choices[0].message.content.trim();
  
  let jsonStr = content;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const tool = JSON.parse(jsonStr) as Tool;
    return tool;
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${jsonStr}`);
  }
}

export const DOC_SYSTEM_PROMPT = `
You are an expert CLI documentation writer. The user will provide a command name and its basic description.
You must write a comprehensive, highly readable Markdown guide for this command.
Use Chinese.

Structure the Markdown as follows:
# {Command Name}
> {Short description}

## 1. 命令简介 (Introduction)
A brief explanation of what the command does and when to use it.

## 2. 语法与参数 (Syntax & Parameters)
Explain the syntax structure. List the common parameters/flags and what they do.
If there are complex combinations, explain them clearly.

## 3. 常见用法与示例 (Common Use Cases & Examples)
Provide 3 to 5 practical, real-world examples.
For each example, provide the exact command and a brief explanation of the expected outcome.

## 4. 注意事项 (Notes/Gotchas)
Any edge cases, warnings, or tips the user should know.

Return ONLY the raw Markdown text. Do not wrap it in \`\`\`markdown blocks.
`;

export async function generateDocFromAI(tool: Tool): Promise<string> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: DOC_SYSTEM_PROMPT },
        { role: "user", content: `Command: ${tool.cmd}\nTitle: ${tool.title}\nAction: ${tool.action}` }
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  let content = data.choices[0].message.content.trim();
  
  if (content.startsWith("```markdown")) {
    content = content.replace(/^```markdown\n?/, "").replace(/\n?```$/, "");
  } else if (content.startsWith("```")) {
    content = content.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  return content;
}

const SCRIPT_SYSTEM_PROMPT = `
You are an expert script writer (Bash/Python).
The user wants a script to dynamically generate options for a CLI tool parameter.
The script will be executed by a Raycast extension.

INPUT:
The script will receive the current project context path as the first argument ($1 in bash, sys.argv[1] in python).

OUTPUT:
The script must print to standard output (stdout).
Each line represents one option.
Format: \`value|title\` (e.g., \`v1.0|Version 1.0\`) OR just \`value\`.

IMPORTANT: You MUST include a title comment at the very beginning of the script code (after the shebang).
Example for bash:
#!/usr/bin/env bash
# Title: 获取局域网IP地址

Example for python:
#!/usr/bin/env python3
# Title: 过滤 Alfred 书签

Return ONLY a valid JSON object:
{
  "name": "suggested_script_name_without_extension",
  "code": "the actual script code including the Title comment",
  "language": "bash" // or "python"
}
DO NOT wrap the JSON in markdown blocks.
`;

export async function generateDynamicScriptFromAI(prompt: string): Promise<{ name: string, code: string, language: string }> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: SCRIPT_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  let content = data.choices[0].message.content.trim();
  
  if (content.startsWith("```json")) {
    content = content.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (content.startsWith("```")) {
    content = content.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", content);
    throw new Error("AI 返回的格式不是有效的 JSON。");
  }
}

export async function modifyScriptWithAI(currentCode: string, prompt: string): Promise<string> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "You are an expert script writer. The user provides an existing script and a modification request. Return ONLY the modified script code. DO NOT wrap in markdown blocks like ```bash. Just return the raw code." },
        { role: "user", content: `CURRENT SCRIPT:\n${currentCode}\n\nMODIFICATION REQUEST:\n${prompt}` }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  let content = data.choices[0].message.content.trim();
  
  if (content.startsWith("```")) {
    content = content.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  }
  
  return content;
}

export async function modifyDocWithAI(currentContent: string, prompt: string): Promise<string> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "You are an expert technical writer. The user provides an existing markdown document and a modification request. Return ONLY the modified markdown content. DO NOT wrap in markdown blocks like ```markdown. Just return the raw text." },
        { role: "user", content: `CURRENT DOCUMENT:\n${currentContent}\n\nMODIFICATION REQUEST:\n${prompt}` }
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  let content = data.choices[0].message.content.trim();
  
  if (content.startsWith("```markdown")) {
    content = content.replace(/^```markdown\n?/, "").replace(/\n?```$/, "");
  } else if (content.startsWith("```")) {
    content = content.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }
  
  return content;
}

export async function organizeCommandsWithAI(tools: Tool[], categories: string[]): Promise<any[]> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const toolsData = tools.map(t => ({ id: t.id, cmd: t.cmd, title: t.title, currentCategory: t.category }));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "You are an expert CLI organizer. The user provides a list of commands and a list of existing categories. Analyze the commands and suggest moving them to a more appropriate category if needed. You can suggest existing categories or propose new ones (without .json). Return ONLY a JSON array of objects: [{ toolId: 'id', toolTitle: 'title', toolCmd: 'cmd', oldCategory: 'old', newCategory: 'new', reason: 'why' }]. DO NOT wrap in markdown blocks. Only return commands that ACTUALLY need to be moved." },
        { role: "user", content: `EXISTING CATEGORIES:\n${categories.join(', ')}\n\nCOMMANDS TO ORGANIZE:\n${JSON.stringify(toolsData, null, 2)}` }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  let content = data.choices[0].message.content.trim();
  
  if (content.startsWith("```json")) {
    content = content.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (content.startsWith("```")) {
    content = content.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }
  
  return JSON.parse(content);
}

export async function parseRawCommandWithAI(rawCmd: string): Promise<Tool> {
  const prefs = getPreferenceValues<AIPreferences>();
  const baseUrl = prefs.aiBaseUrl || "https://api.openai.com/v1";
  const apiKey = prefs.aiApiKey || "";
  const model = prefs.aiModel || "gpt-4o";

  const systemPrompt = `You are an expert CLI configuration assistant.
The user will provide a raw, complex shell command (e.g., a one-liner script or a long command with specific paths/values).
Your task is to reverse-engineer this command and convert it into a reusable Keymap Tool JSON format.
1. Identify hardcoded values (like paths, names, URLs, IDs) that should be variables.
2. Replace them in the 'cmd' string with {variable_name}.
3. Create corresponding 'params' definitions for these variables.
4. Give the tool a clear Chinese title and action description.
5. Set 'mode': 'cli'.
6. For file paths and directory paths, ALWAYS use type: "file" or type: "directory". For multiple files, use type: "multiselect" and dynamic: "file_path".
7. Return ONLY the valid JSON object representing the Tool. DO NOT wrap in markdown blocks.`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RAW COMMAND:\n${rawCmd}` }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API Error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  let content = data.choices[0].message.content.trim();
  
  if (content.startsWith("```json")) content = content.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  else if (content.startsWith("```")) content = content.replace(/^```\n?/, "").replace(/\n?```$/, "");
  
  const tool = JSON.parse(content) as Tool;
  tool.id = `ai-parsed-${Date.now()}`;
  tool.category = "custom";
  if (!tool.tags) tool.tags = [];
  tool.tags.push("AI解析");
  return tool;
}
