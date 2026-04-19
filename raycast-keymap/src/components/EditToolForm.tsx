import { Form, ActionPanel, Action, useNavigation, showToast, Toast, Icon, Detail } from "@raycast/api";
import { useState, useEffect } from "react";
import { Tool } from "../types";
import { modifyCommandWithAI } from "../ai";

const SCHEMA_DOCS = `
# 📖 命令配置 JSON 速查手册

当你看到一坨 JSON 不知道怎么改时，对照这里就能看懂！

---

## 🛠 1. 核心字段 (必填)
这是每个命令都必须有的最外层字段：
*   \`"id"\`: 唯一标识（如 \`"git-push"\`）
*   \`"title"\`: 列表里显示的大标题（如 \`"推送代码"\`）
*   \`"action"\`: 列表里显示的小字说明（如 \`"上传本地提交到远程"\`）
*   \`"cmd"\`: **最关键的命令模板！** 
    *   例如：\`"git push {remote} {branch}"\`
    *   里面的 \`{xxx}\` 就是参数，必须在下面的 \`"params"\` 数组里定义！
    *   **支持多行命令和管道！** 你可以写 \`"cd {dir} && npm run {script}"\` 或者用 \`;\` 分隔。
*   \`"mode"\`: (可选) 设为 \`"silent"\` 可在后台静默执行并回显结果，不打开终端。

---

## 🎛 2. 参数定义 (\`"params"\` 数组)
如果你的 \`"cmd"\` 里有 \`{xxx}\`，这里就必须配置它长什么样。

### 📌 基础属性
*   \`"id"\`: 必须和 \`cmd\` 里的名字一样（如 \`"remote"\`）
*   \`"description"\`: 输入框旁边的中文提示（如 \`"远程仓库名"\`）
*   \`"optional"\`: \`true\` 或 \`false\`。如果是 \`true\`，用户不填也能执行。

### 🎨 \`"type"\` (参数长什么样？)
这是决定交互体验的核心！
1.  **\`"string"\`**：**最常用的普通输入框！** 适合输入路径、名字、URL等。（如果你发现某个参数变成了烦人的下拉框，把它改成 \`"string"\`，并删掉 \`"dynamic"\` 字段就能解决！）
2.  **\`"flags"\`**：**多选打钩框！** 适合配置 \`-f\`, \`-a\`, \`--force\` 这种可选参数。必须配合 \`"options"\` 字段使用。
3.  **\`"brace"\`**：**带提示的输入框！** 适合需要给用户一些 example 提示的场景。
4.  **\`"file"\` / \`"directory"\`**：**原生文件/目录选择器！** 弹出一个原生的文件选择窗口，选中后自动填入路径。
5.  **\`"multiselect"\`**：**多选标签框！** 允许用户输入或选择多个值，最终会用空格拼接起来（比如选多个文件或分支）。

---

## 🪄 3. 高级玩法 (可选)

### 📊 固定的下拉选项 (\`"options"\`)
当 \`"type"\` 是 \`"flags"\` 或你想限制用户只能选几个固定值时使用：
\`\`\`json
"options": [
  { "title": "强制推送 (-f)", "value": "-f" },
  { "title": "设置上游 (-u)", "value": "-u" }
]
\`\`\`

### 🔄 自动获取系统数据 (\`"dynamic"\`)
如果加了这个字段，输入框会变成**自动获取数据的下拉框**（并且永远支持手动输入作为第一个选项）。
*   **内置数据源**：\`"file_path"\`, \`"git_branches"\`, \`"docker_containers"\`, \`"adb_devices"\` 等。
*   **自定义脚本数据源**：你可以填任意名字（如 \`"my_custom_data"\`）。
    *   然后在你配置的 \`Scripts Directory\` 目录下（支持配置多个路径，用逗号分隔）。
    *   在里面放一个同名可执行脚本（如 \`my_custom_data\`, \`my_custom_data.sh\`, \`my_custom_data.py\`）。
    *   **规范**：脚本会收到当前项目路径作为 \`$1\`。脚本需要输出到标准输出，每行一个选项，格式为 \`value|title\` 或直接 \`value\`。
    *   **AI 辅助**：在主界面的搜索框输入 \`$ 你的需求\`（例如 \`$ 列出所有txt文件\`）回车，AI 会帮你生成动态参数脚本并自动保存到 \`Scripts Directory\`（默认保存到配置的第一个路径）。

> ⚠️ **排错指南**：如果你只是想手动输入一个路径，但它变成了下拉框，**请直接把 \`"dynamic"\` 这一行删掉！**

### 🔗 联动显示 (\`"showIf"\` / \`"requiredIf"\`)
根据其他参数的选择，决定这个参数要不要显示。
\`\`\`json
"showIf": {
  "paramId": "flags", // 监听哪个参数
  "includes": ["-b"]  // 只有当 flags 选了 -b 时，我才显示
}
\`\`\`
`;

import { AvailableScriptsList } from "./AvailableScriptsList";

function SchemaDocs() {
  return <Detail markdown={SCHEMA_DOCS} />;
}

export default function EditToolForm({ tool, onSave, onDelete }: { tool: Tool, onSave: (updatedTool: Tool, category?: string) => void, onDelete?: () => void }) {
  const { pop } = useNavigation();
  const [jsonStr, setJsonStr] = useState(() => JSON.stringify(tool, null, 2));
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Category state
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(tool.category || "");
  const [customCategory, setCustomCategory] = useState<string>("");

  useEffect(() => {
    // Dynamically import to avoid circular dependencies if any
    import("../utils").then(({ getAllCategories, predictCategory }) => {
      const cats = getAllCategories();
      setCategories(cats);
      if (!tool.category) {
        setSelectedCategory(predictCategory(tool));
      }
    });
  }, [tool]);

  const handleSubmit = async () => {
    try {
      const updatedTool = JSON.parse(jsonStr) as Tool;
      if (!updatedTool.id || !updatedTool.cmd) {
        throw new Error("Invalid Tool JSON: missing id or cmd");
      }
      const finalCategory = selectedCategory === "__CUSTOM__" ? customCategory.trim() : selectedCategory;
      await onSave(updatedTool, finalCategory || undefined);
      pop();
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "Invalid JSON format", message: e.message });
    }
  };

  const handleAIModify = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在修改配置..." });
    try {
      const updatedTool = await modifyCommandWithAI(jsonStr, aiPrompt);
      setJsonStr(JSON.stringify(updatedTool, null, 2));
      setAiPrompt("");
      toast.style = Toast.Style.Success;
      toast.title = "修改成功！";
    } catch (e: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "修改失败";
      toast.message = e.message;
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Form
      isLoading={isGenerating}
      actions={
        <ActionPanel>
          {aiPrompt.trim() ? (
            <ActionPanel.Section title="AI Assistant">
              <Action title="Ask AI to Modify (Enter)" icon={Icon.Wand} onAction={handleAIModify} />
              <Action.SubmitForm title="Save Changes" icon={Icon.SaveDocument} onSubmit={handleSubmit} shortcut={{ modifiers: ["cmd"], key: "s" }} />
            </ActionPanel.Section>
          ) : (
            <ActionPanel.Section title="Save">
              <Action.SubmitForm title="Save Changes (Enter)" icon={Icon.SaveDocument} onSubmit={handleSubmit} />
              <Action title="Ask AI to Modify" icon={Icon.Wand} shortcut={{ modifiers: ["cmd"], key: "m" }} onAction={handleAIModify} />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section title="Help & Danger Zone">
            <Action.Push title="View Parameter Schema" icon={Icon.Book} target={<SchemaDocs />} shortcut={{ modifiers: ["cmd"], key: "i" }} />
            <Action.Push title="View Available Scripts" icon={Icon.Code} target={<AvailableScriptsList />} shortcut={{ modifiers: ["cmd", "shift"], key: "s" }} />
            {onDelete && (
              <Action 
                title="Delete Command" 
                icon={Icon.Trash} 
                style={Action.Style.Destructive} 
                shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                onAction={() => { 
                  onDelete(); 
                  pop(); 
                }} 
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.Description text="直接编辑命令的 JSON 配置。不知道怎么改？按 Cmd + I 查看速查手册，或使用下方 AI 辅助。" />
      <Form.TextField
        id="aiPrompt"
        title="✨ AI 辅助修改"
        placeholder="例如：帮我把 local 参数改成普通文本输入框 (填完后直接按 Enter)"
        value={aiPrompt}
        onChange={setAiPrompt}
      />
      <Form.Dropdown
        id="category"
        title="存储大类 (Category)"
        value={selectedCategory}
        onChange={setSelectedCategory}
        info="选择命令保存的文件（如 git.json）。如果选择自定义，将创建新文件。"
      >
        {categories.map(c => <Form.Dropdown.Item key={c} value={c} title={`${c}.json`} />)}
        <Form.Dropdown.Item value="__CUSTOM__" title="✏️ 自定义新大类 (Custom...)" />
      </Form.Dropdown>
      
      {selectedCategory === "__CUSTOM__" && (
        <Form.TextField
          id="customCategory"
          title="新大类名称"
          placeholder="例如: my_tools (不需要写 .json)"
          value={customCategory}
          onChange={setCustomCategory}
        />
      )}
      
      <Form.Separator />
      <Form.TextArea
        id="json"
        title="Tool JSON"
        value={jsonStr}
        onChange={setJsonStr}
        enableMarkdown={false}
      />
    </Form>
  );
}