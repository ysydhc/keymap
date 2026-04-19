const fs = require('fs');
const path = require('path');

let content = fs.readFileSync('src/utils.ts', 'utf-8');

// 1. Add getAllCategories and predictCategory
const newFunctions = `
export function getAllCategories(): string[] {
  const prefs = require("@raycast/api").getPreferenceValues();
  const dirs = getDirPaths(prefs.toolsDir);
  const categories = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    files.forEach(f => categories.add(f.replace('.json', '')));
  }
  return Array.from(categories).sort();
}

export function predictCategory(tool: Tool): string {
  const cmdFirstWord = tool.cmd.split(' ')[0].toLowerCase();
  const tags = (tool.tags || []).map(t => t.toLowerCase());
  
  const majorTools = [
    "git", "adb", "docker", "npm", "yarn", "pnpm", "brew", "kubectl", 
    "python", "pip", "cargo", "flutter", "pod", "fastlane", "gh", 
    "aws", "gcloud", "node", "go", "fish", "xcodebuild"
  ];

  const existingCategories = getAllCategories();

  if (existingCategories.includes(cmdFirstWord)) return cmdFirstWord;
  for (const tag of tags) {
    if (existingCategories.includes(tag)) return tag;
  }
  if (majorTools.includes(cmdFirstWord)) {
    return cmdFirstWord === "xcodebuild" ? "xcode" : cmdFirstWord;
  }
  return "custom";
}
`;

// Insert after getTools
content = content.replace(/(export function getTools[\s\S]*?return tools;\n})/, '$1\n\n' + newFunctions);

// 2. Modify saveToolToLocal to accept explicitCategory
content = content.replace(
  /export function saveToolToLocal\(tool: Tool\): \{ category: string, path: string \} \{/,
  'export function saveToolToLocal(tool: Tool, explicitCategory?: string): { category: string, path: string } {'
);

// Replace the category prediction logic inside saveToolToLocal
const oldCategoryLogic = `  // Automatically determine the best category based on existing files across ALL configured directories
  let category = "custom";
  let targetDir = dirs[0]; // Default to the first directory if no match is found
  
  const cmdFirstWord = tool.cmd.split(' ')[0].toLowerCase();
  const tags = (tool.tags || []).map(t => t.toLowerCase());
  
  // 常见的大类命令，即使本地没有对应的 json 文件，也应该自动创建大类文件
  const majorTools = [
    "git", "adb", "docker", "npm", "yarn", "pnpm", "brew", "kubectl", 
    "python", "pip", "cargo", "flutter", "pod", "fastlane", "gh", 
    "aws", "gcloud", "node", "go", "fish", "xcodebuild"
  ];

  let foundMatch = false;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const existingCategories = files.map(f => f.replace('.json', ''));

    // 1. 尝试匹配已有的分类文件 (最优先，如果其他目录有 android.json，就应该存到那里)
    if (existingCategories.includes(cmdFirstWord)) {
      category = cmdFirstWord;
      targetDir = dir;
      foundMatch = true;
      break;
    } 
    
    // 2. 尝试匹配标签
    for (const tag of tags) {
      if (existingCategories.includes(tag)) {
        category = tag;
        targetDir = dir;
        foundMatch = true;
        break;
      }
    }
    if (foundMatch) break;
  }

  // 3. 如果在所有目录都没找到匹配的，再看看是不是已知的大类命令
  if (!foundMatch && majorTools.includes(cmdFirstWord)) {
    category = cmdFirstWord === "xcodebuild" ? "xcode" : cmdFirstWord;
    targetDir = dirs[0]; // 新建文件默认放到第一个目录
  }`;

const newCategoryLogic = `  let category = explicitCategory || "custom";
  let targetDir = dirs[0];
  
  if (!explicitCategory) {
    category = predictCategory(tool);
  }
  
  // Find which dir has this category, or default to first dir
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    if (fs.readdirSync(dir).includes(category + '.json')) {
      targetDir = dir;
      break;
    }
  }`;

content = content.replace(oldCategoryLogic, newCategoryLogic);

// 3. Modify updateToolInLocal
content = content.replace(
  /export function updateToolInLocal\(updatedTool: Tool\): void \{/,
  'export function updateToolInLocal(updatedTool: Tool, explicitCategory?: string): void {'
);

const oldUpdateLogic = `        if (index !== -1) {
          // Found it!
          fs.copyFileSync(filePath, \`\${filePath}.bak\`); // Backup
          const toolToSave = { ...updatedTool };
          delete toolToSave.category;
          data.tools[index] = toolToSave;
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
          return;
        }`;

const newUpdateLogic = `        if (index !== -1) {
          // Found it!
          fs.copyFileSync(filePath, \`\${filePath}.bak\`); // Backup
          const toolToSave = { ...updatedTool };
          delete toolToSave.category;
          
          const oldCategory = path.basename(filePath, '.json');
          const newCategory = explicitCategory || oldCategory;
          
          if (oldCategory === newCategory) {
            data.tools[index] = toolToSave;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
          } else {
            // Remove from old
            data.tools.splice(index, 1);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            // Save to new
            saveToolToLocal(toolToSave, newCategory);
          }
          return;
        }`;

content = content.replace(oldUpdateLogic, newUpdateLogic);

fs.writeFileSync('src/utils.ts', content);
console.log("Patched utils.ts successfully.");
