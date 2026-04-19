import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/kb.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the path resolution logic
old_logic = """      {filteredBooks.map((book, index) => {
        const isUrl = book.target.startsWith("http://") || book.target.startsWith("https://");
        const targetPath = isUrl ? book.target : expandPath(book.target);"""

new_logic = """      {filteredBooks.map((book, index) => {
        const isUrl = book.target.startsWith("http://") || book.target.startsWith("https://");
        let targetPath = book.target;
        
        if (!isUrl) {
          if (!targetPath.startsWith('/') && !targetPath.startsWith('~/')) {
            // Relative path handling
            const prefs = getPreferenceValues<any>();
            if (book.tags && book.tags.includes("ai-doc")) {
              if (!prefs.docsDir) {
                // If docsDir is missing, fallback to booksDir/docs
                targetPath = path.join(expandPath(prefs.booksDir), "docs", targetPath);
              } else {
                targetPath = path.join(expandPath(prefs.docsDir), targetPath);
              }
            } else {
              targetPath = path.join(expandPath(prefs.booksDir), targetPath);
            }
          } else {
            targetPath = expandPath(targetPath);
          }
        }"""

content = content.replace(old_logic, new_logic)

# Add getPreferenceValues and path to imports if not there
if "getPreferenceValues" not in content:
    content = content.replace('import { ActionPanel, Action, List, Icon, LaunchProps } from "@raycast/api";', 'import { ActionPanel, Action, List, Icon, LaunchProps, getPreferenceValues } from "@raycast/api";')
if "import path from" not in content:
    content = 'import path from "path";\n' + content

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated kb.tsx to resolve paths dynamically")
