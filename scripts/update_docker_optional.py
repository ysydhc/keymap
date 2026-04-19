import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/docker.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'docker-run':
        tool['cmd'] = 'docker run {flags} {image} {command}'
        if not any(p['id'] == 'command' for p in tool['params']):
            tool['params'].append({
                "id": "command",
                "type": "string",
                "description": "容器启动命令 (可选，如 sh, bash)",
                "optional": True
            })

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated docker.json")
