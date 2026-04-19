import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    'import { ActionPanel, Action, List, Icon, LaunchProps, showToast, Toast, LocalStorage } from "@raycast/api";',
    'import { ActionPanel, Action, List, Icon, LaunchProps, showToast, Toast, LocalStorage, open } from "@raycast/api";'
)

content = content.replace(
    'import { getTools, pureCopyCmd, saveToolToLocal, restoreBackup } from "./utils";',
    'import { getTools, pureCopyCmd, saveToolToLocal, restoreBackup, getExistingDocPath } from "./utils";'
)

# 2. Update handleGenerateDoc
old_handler = """  const handleGenerateDoc = async (tool: Tool) => {
    setIsGeneratingAI(true);"""

new_handler = """  const handleGenerateDoc = async (tool: Tool) => {
    const existingPath = getExistingDocPath(tool.id);
    if (existingPath) {
      const encodedPath = encodeURIComponent(existingPath);
      await open(`hammerspoon://show_md?path=${encodedPath}`);
      await showToast({ style: Toast.Style.Success, title: "已打开本地文档" });
      return;
    }

    setIsGeneratingAI(true);"""

content = content.replace(old_handler, new_handler)

# 3. Rename the action title to reflect its dual purpose
old_action = """              <Action 
                title="Generate AI Guide (生成文档)" 
                icon={Icon.Book} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "g" }} 
                onAction={() => handleGenerateDoc(tool)} 
              />"""

new_action = """              <Action 
                title="Open/Generate Guide (打开/生成文档)" 
                icon={Icon.Book} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "g" }} 
                onAction={() => handleGenerateDoc(tool)} 
              />"""

content = content.replace(old_action, new_action)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated km.tsx to open existing docs directly")
