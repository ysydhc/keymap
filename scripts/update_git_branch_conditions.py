import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'git-branch':
        for param in tool.get('params', []):
            if param['id'] == 'branch':
                param['showIf'] = {
                    "paramId": "flags",
                    "excludes": ["-a", "-r", "-v", "-vv", "--merged", "--no-merged", "--show-current"]
                }
                param['requiredIf'] = {
                    "paramId": "flags",
                    "includes": ["-d", "-D", "-m", "-M"]
                }
            elif param['id'] == 'base_branch':
                param['showIf'] = {
                    "paramId": "flags",
                    "excludes": ["-d", "-D", "-m", "-M", "-a", "-r", "-v", "-vv", "--merged", "--no-merged", "--show-current"]
                }

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated git.json")
