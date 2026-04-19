import json

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/package.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for cmd in data.get('commands', []):
    if cmd['name'] == 'km':
        cmd['icon'] = 'assets/km-icon.svg'
    elif cmd['name'] == 'kb':
        cmd['icon'] = 'assets/kb-icon.svg'

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated package.json with SVG icons")
