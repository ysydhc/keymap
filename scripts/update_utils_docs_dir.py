import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/utils.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace saveDocToLocal
old_save_doc = """export function saveDocToLocal(tool: Tool, markdownContent: string): string {
  const prefs = getPreferenceValues<Preferences>();
  const booksDir = expandPath(prefs.booksDir);
  
  if (!fs.existsSync(booksDir)) {
    fs.mkdirSync(booksDir, { recursive: true });
  }

  const docsDir = path.join(booksDir, "docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // 1. Save Markdown file
  const mdFileName = `${tool.id}.md`;
  const mdFilePath = path.join(docsDir, mdFileName);
  fs.writeFileSync(mdFilePath, markdownContent, 'utf-8');

  // 2. Update ai_generated.json in booksDir
  const jsonFilePath = path.join(booksDir, "ai_generated.json");
  let data: BookFile = { books: [] };

  if (fs.existsSync(jsonFilePath)) {
    try {
      const content = fs.readFileSync(jsonFilePath, 'utf-8');
      data = JSON.parse(content);
      if (!data.books) data.books = [];
    } catch (e) {
      console.error(`Error reading ${jsonFilePath}:`, e);
    }
  }

  // Check if book already exists
  const targetPath = path.join(prefs.booksDir, "docs", mdFileName);
  const existingIndex = data.books.findIndex(b => b.target === targetPath);
  
  const newBook: Book = {
    title: `AI 指南: ${tool.title}`,
    subtitle: tool.cmd,
    target: targetPath,
    tags: ["ai-doc", tool.category || "custom"]
  };

  if (existingIndex >= 0) {
    data.books[existingIndex] = newBook;
  } else {
    data.books.push(newBook);
  }

  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf-8');
  
  return mdFilePath;
}"""

new_save_doc = """export function saveDocToLocal(tool: Tool, markdownContent: string): string {
  const prefs = getPreferenceValues<any>();
  if (!prefs.docsDir) {
    throw new Error("请先在插件设置 (Cmd+Shift+,) 中配置 Docs Directory");
  }

  const docsDir = expandPath(prefs.docsDir);
  const booksDir = expandPath(prefs.booksDir);
  
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // 1. Save Markdown file
  const mdFileName = `${tool.id}.md`;
  const mdFilePath = path.join(docsDir, mdFileName);
  fs.writeFileSync(mdFilePath, markdownContent, 'utf-8');

  // 2. Update ai_generated.json in booksDir
  const jsonFilePath = path.join(booksDir, "ai_generated.json");
  let data: BookFile = { books: [] };

  if (fs.existsSync(jsonFilePath)) {
    try {
      const content = fs.readFileSync(jsonFilePath, 'utf-8');
      data = JSON.parse(content);
      if (!data.books) data.books = [];
    } catch (e) {
      console.error(`Error reading ${jsonFilePath}:`, e);
    }
  }

  // Check if book already exists (we now just store the filename elegantly)
  const targetPath = mdFileName;
  const existingIndex = data.books.findIndex(b => b.target === targetPath);
  
  const newBook: Book = {
    title: `AI 指南: ${tool.title}`,
    subtitle: tool.cmd,
    target: targetPath,
    tags: ["ai-doc", tool.category || "custom"]
  };

  if (existingIndex >= 0) {
    data.books[existingIndex] = newBook;
  } else {
    data.books.push(newBook);
  }

  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf-8');
  
  return mdFilePath;
}"""

# Replace getExistingDocPath
old_get_doc = """export function getExistingDocPath(toolId: string): string | null {
  const prefs = getPreferenceValues<Preferences>();
  const booksDir = expandPath(prefs.booksDir);
  const mdFilePath = path.join(booksDir, "docs", `${toolId}.md`);
  if (fs.existsSync(mdFilePath)) {
    return mdFilePath;
  }
  return null;
}"""

new_get_doc = """export function getExistingDocPath(toolId: string): string | null {
  const prefs = getPreferenceValues<any>();
  if (!prefs.docsDir) return null;
  const docsDir = expandPath(prefs.docsDir);
  const mdFilePath = path.join(docsDir, `${toolId}.md`);
  if (fs.existsSync(mdFilePath)) {
    return mdFilePath;
  }
  return null;
}"""

content = content.replace(old_save_doc, new_save_doc)
content = content.replace(old_get_doc, new_get_doc)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated utils.ts with dynamic docsDir")
