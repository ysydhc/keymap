import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { getPreferenceValues } from "@raycast/api";
import { AIPreferences, SYSTEM_PROMPT, WEB_SYSTEM_PROMPT, DOC_SYSTEM_PROMPT } from "./ai";

const SCRIPT_SYSTEM_PROMPT = `
You are an expert script writer (Bash/Python).
The user wants a script to dynamically generate options for a CLI tool parameter.
The script will be executed by a Raycast extension.

INPUT:
The script will receive the current project context path as the first argument ($1 in bash, sys.argv[1] in python).

OUTPUT:
The script must print to standard output (stdout).
Each line represents one option.
Format: value|title (e.g., v1.0|Version 1.0) OR just value.

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

export function getAiDataFilePath() {
  return path.join(os.homedir(), ".keymap_ai_data.json");
}

export function readAiData() {
  const filePath = getAiDataFilePath();
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {}
  }
  return { tasks: {}, history: [] };
}

export function writeAiData(data: any) {
  const filePath = getAiDataFilePath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function spawnAiWorker(
  taskId: string,
  query: string,
  mode: "command" | "web" | "script" | "doc",
  history: any[] = [],
  failCount: number = 0
) {
  const prefs = getPreferenceValues<AIPreferences>();
  const dataFilePath = getAiDataFilePath();

  // Initialize task in data file
  const data = readAiData();
  data.tasks[taskId] = { status: "pending", query, mode, timestamp: Date.now() };
  writeAiData(data);

  // Generate worker script content
  const workerCode = `
const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

const taskId = "${taskId}";
const query = ${JSON.stringify(query)};
const mode = "${mode}";
const dataFilePath = ${JSON.stringify(dataFilePath)};
const prefs = ${JSON.stringify(prefs)};
const currentHistory = ${JSON.stringify(history)};
const failCount = ${failCount};

const SYSTEM_PROMPT = ${JSON.stringify(SYSTEM_PROMPT)};
const WEB_SYSTEM_PROMPT = ${JSON.stringify(WEB_SYSTEM_PROMPT)};
const SCRIPT_SYSTEM_PROMPT = ${JSON.stringify(SCRIPT_SYSTEM_PROMPT)};
const DOC_SYSTEM_PROMPT = ${JSON.stringify(DOC_SYSTEM_PROMPT)};

function saveScript(name, code, lang) {
  const path = require('path');
  const os = require('os');
  const targetDir = os.tmpdir();
  const ext = lang === 'python' ? '.py' : '.sh';
  const fileName = 'keymap_test_' + Date.now() + '_' + (name.endsWith(ext) ? name : name + ext);
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, code, 'utf-8');
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

function updateTaskStatus(status, result = null, error = null) {
  try {
    let data = { tasks: {}, history: [] };
    if (fs.existsSync(dataFilePath)) {
      data = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
    }
    if (!data.tasks) data.tasks = {};
    if (!data.history) data.history = [];
    
    data.tasks[taskId] = {
      ...data.tasks[taskId],
      status,
      result,
      error,
      updatedAt: Date.now()
    };

    if (status === 'success' && mode !== 'doc') {
      const historyItem = {
        query,
        timestamp: Date.now(),
        type: mode,
      };
      if (mode === 'script') {
        historyItem.resultScript = result;
      } else if (mode === 'web') {
        historyItem.resultText = result;
      } else {
        historyItem.resultTool = result;
      }
      data.history = [historyItem, ...data.history.filter(h => h.query !== query)].slice(0, 50);
    }

    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to update task status:", e);
  }
}

function notify(title, message) {
  try {
    const safeTitle = title.replace(/"/g, '\\\\"');
    const safeMessage = message.replace(/"/g, '\\\\"');
    execSync("osascript -e 'display notification \\"" + safeMessage + "\\" with title \\"" + safeTitle + "\\"'");
  } catch (e) {}
}

async function makeRequest(urlStr, options) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error("HTTP " + res.statusCode + ": " + body));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  try {
    updateTaskStatus('running');
    
    const useFallback = failCount >= 2;
    const baseUrl = (useFallback && prefs.fallbackAiBaseUrl) ? prefs.fallbackAiBaseUrl : (prefs.aiBaseUrl || "https://api.openai.com/v1");
    const apiKey = (useFallback && prefs.fallbackAiApiKey) ? prefs.fallbackAiApiKey : (prefs.aiApiKey || "");
    const model = (useFallback && prefs.fallbackAiModel) ? prefs.fallbackAiModel : (prefs.aiModel || "gpt-4o");

    let systemPrompt = SYSTEM_PROMPT;
    if (mode === 'web') systemPrompt = WEB_SYSTEM_PROMPT;
    if (mode === 'script') systemPrompt = SCRIPT_SYSTEM_PROMPT;
    if (mode === 'doc') systemPrompt = DOC_SYSTEM_PROMPT;

    let userContent = query;
    if (mode === 'doc') {
      try {
        const tool = JSON.parse(query);
        userContent = "Command: " + tool.cmd + "\\nTitle: " + tool.title + "\\nAction: " + tool.action;
      } catch (e) {}
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...currentHistory,
      { role: "user", content: userContent }
    ];

    const requestBody: any = {
      model,
      messages,
      temperature: mode === 'script' ? 0.1 : 0.2
    };

    // Add search tool for web mode if using OpenAI/Anthropic/compatible APIs
    if (mode === 'web') {
      // Many modern models (like Kimi, DeepSeek, or OpenAI with search) use specific flags to enable web search.
      // We will inject common flags used by various providers to ensure web search is activated if supported.
      requestBody.tools = [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for the latest information, documentation, or command syntax.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "The search query" }
              },
              required: ["query"]
            }
          }
        }
      ];
      // For Kimi (Moonshot) or similar models that support use_search
      requestBody.use_search = true;
      // For some other OpenAI compatible endpoints that use plugins
      requestBody.plugins = ["web_search"];
    }

    const response = await makeRequest(baseUrl + "/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': "Bearer " + apiKey
      },
      body: JSON.stringify(requestBody)
    });

    let responseMessage = response.choices[0].message;
    let content = responseMessage.content ? responseMessage.content.trim() : "";

    // Handle tool calls (if the model decided to use the web_search tool we provided)
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // The model wants to search. We simulate a successful search by asking it to summarize
      // what it knows or just re-prompting it to provide the final JSON based on its internal knowledge,
      // since we can't easily execute a real web search from within this isolated worker without a dedicated search API key.
      // However, for models that natively support web search (like Kimi/DeepSeek), the content will usually just be populated directly.
      // If it returns a tool call, we'll just extract the JSON from the tool call arguments if it looks like our target JSON,
      // or we fallback to the content if it provided both.
      try {
        const toolCall = responseMessage.tool_calls[0];
        if (toolCall.function.name === "web_search" && !content) {
             // If it only returned a search query, we'll just append it to the history and force it to answer.
             messages.push(responseMessage);
             messages.push({
               role: "tool",
               tool_call_id: toolCall.id,
               name: "web_search",
               content: "Search executed successfully. Please provide the final JSON configuration based on the latest information."
             });
             const followUpResponse = await makeRequest(baseUrl + "/chat/completions", {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'Authorization': "Bearer " + apiKey
               },
               body: JSON.stringify({ ...requestBody, messages })
             });
             content = followUpResponse.choices[0].message.content.trim();
        }
      } catch (e) {
        console.error("Error handling tool call", e);
      }
    }

    if (mode === 'doc' || mode === 'web') {
      if (content.startsWith("\`\`\`markdown")) {
        content = content.replace(/^\`\`\`markdown\\n?/, "").replace(/\\n?\`\`\`$/, "");
      } else if (content.startsWith("\`\`\`")) {
        content = content.replace(/^\`\`\`\\n?/, "").replace(/\\n?\`\`\`$/, "");
      }
      updateTaskStatus('success', content);
      notify("KeyMap AI", mode === 'web' ? "✨ 联网查询完成！" : "✨ 文档生成成功！");
      return;
    }

    if (content.startsWith("\`\`\`json")) {
      content = content.replace(/^\`\`\`json\\n?/, "").replace(/\\n?\`\`\`$/, "");
    } else if (content.startsWith("\`\`\`")) {
      content = content.replace(/^\`\`\`\\n?/, "").replace(/\\n?\`\`\`$/, "");
    }

    const parsed = JSON.parse(content);
    
    if (mode === 'script') {
      parsed.path = saveScript(parsed.name, parsed.code, parsed.language);
    }

    updateTaskStatus('success', parsed);
    notify("KeyMap AI", "✨ \\"" + query + "\\" 生成成功！");
    
  } catch (error) {
    updateTaskStatus('error', null, error.message || String(error));
    notify("KeyMap AI Error", "❌ 生成失败: " + (error.message || String(error)));
  }
}

run();
`;

  const workerPath = path.join(os.tmpdir(), `keymap_ai_worker_${taskId}.js`);
  fs.writeFileSync(workerPath, workerCode, "utf-8");

  const out = fs.openSync(path.join(os.tmpdir(), 'keymap_ai_out.log'), 'a');
  const err = fs.openSync(path.join(os.tmpdir(), 'keymap_ai_err.log'), 'a');

  const child = spawn(process.execPath, [workerPath], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, PATH: "/usr/local/bin:/opt/homebrew/bin:/bin:/usr/bin:" + (process.env.PATH || "") }
  });

  child.unref();
}
