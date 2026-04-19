import json

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/package.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

new_pref = {
    "name": "docsDir",
    "type": "textfield",
    "required": False,
    "title": "Docs Directory",
    "description": "Absolute path to save AI generated markdown docs",
    "default": "~/Work/agent/MyGuguGaga/key_map/books/docs"
}

existing_names = [p['name'] for p in data.get('preferences', [])]
if 'docsDir' not in existing_names:
    # Insert it after booksDir
    prefs = data['preferences']
    idx = next((i for i, p in enumerate(prefs) if p['name'] == 'booksDir'), 0)
    prefs.insert(idx + 1, new_pref)

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated package.json with docsDir")
