import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the grouping logic
old_logic = """    const grouped = rest.reduce((acc, tool) => {
      const cat = tool.category || "other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(tool);
      return acc;
    }, {} as Record<string, Tool[]>);"""

new_logic = """    const formatCategory = (cat: string) => {
      if (cat === "macos") return "macOS";
      if (cat === "npm") return "npm";
      if (cat === "git") return "Git";
      if (cat === "docker") return "Docker";
      if (cat === "android-studio") return "Android Studio";
      if (cat === "cursor") return "Cursor";
      if (cat === "ghostty") return "Ghostty";
      if (cat === "node") return "Node.js";
      return cat.charAt(0).toUpperCase() + cat.slice(1);
    };

    const grouped = rest.reduce((acc, tool) => {
      const cat = formatCategory(tool.category || "other");
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(tool);
      return acc;
    }, {} as Record<string, Tool[]>);"""

new_content = content.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Updated km.tsx with category formatting")
