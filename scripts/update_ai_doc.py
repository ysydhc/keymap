import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/ai.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add generateDocFromAI
doc_func = """
const DOC_SYSTEM_PROMPT = `
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
        { role: "user", content: `Command: ${tool.cmd}\\nTitle: ${tool.title}\\nAction: ${tool.action}` }
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
    content = content.replace(/^```markdown\\n?/, "").replace(/\\n?```$/, "");
  } else if (content.startsWith("```")) {
    content = content.replace(/^```\\n?/, "").replace(/\\n?```$/, "");
  }

  return content;
}
"""

if "generateDocFromAI" not in content:
    content += doc_func
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added generateDocFromAI to ai.ts")
