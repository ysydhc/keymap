import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/utils.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add saveToolToLocal
save_func = """
export function saveToolToLocal(tool: Tool, category: string = "custom"): void {
  const prefs = getPreferenceValues<Preferences>();
  const toolsDir = expandPath(prefs.toolsDir);
  
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }

  const filePath = path.join(toolsDir, `${category}.json`);
  const backupPath = path.join(toolsDir, `${category}.json.bak`);

  let data: ToolFile = { tools: [] };

  if (fs.existsSync(filePath)) {
    // 1. Create backup
    fs.copyFileSync(filePath, backupPath);
    
    // 2. Read existing
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(content);
      if (!data.tools) data.tools = [];
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e);
    }
  }

  // 3. Append new tool
  const newTool = { ...tool };
  delete newTool.category; // Remove internal category field before saving
  data.tools.push(newTool);

  // 4. Save
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function restoreBackup(category: string = "custom"): boolean {
  const prefs = getPreferenceValues<Preferences>();
  const toolsDir = expandPath(prefs.toolsDir);
  const filePath = path.join(toolsDir, `${category}.json`);
  const backupPath = path.join(toolsDir, `${category}.json.bak`);

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    return true;
  }
  return false;
}
"""

if "saveToolToLocal" not in content:
    content += save_func
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated utils.ts with save logic")
else:
    print("Save logic already exists")
