import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/utils.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_func = """
export function getExistingDocPath(toolId: string): string | null {
  const prefs = getPreferenceValues<Preferences>();
  const booksDir = expandPath(prefs.booksDir);
  const mdFilePath = path.join(booksDir, "docs", `${toolId}.md`);
  if (fs.existsSync(mdFilePath)) {
    return mdFilePath;
  }
  return null;
}
"""

if "getExistingDocPath" not in content:
    content += new_func
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added getExistingDocPath to utils.ts")
else:
    print("getExistingDocPath already exists")
