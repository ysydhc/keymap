import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'git-rebase':
        tool['cmd'] = 'git rebase {flags} {branch} {commit}'
        for param in tool['params']:
            if param['id'] == 'branch':
                param['description'] = "基线分支 (与提交二选一)"
                if 'requiredIf' in param:
                    del param['requiredIf']
        if not any(p['id'] == 'commit' for p in tool['params']):
            tool['params'].append({
                "id": "commit",
                "type": "string",
                "description": "基线提交 (与分支二选一)",
                "dynamic": "git_commits",
                "optional": True,
                "showIf": {
                    "paramId": "flags",
                    "excludes": ["--continue", "--abort", "--skip"]
                }
            })
            
    elif tool['id'] == 'git-merge':
        tool['cmd'] = 'git merge {flags} {branch} {commit}'
        for param in tool['params']:
            if param['id'] == 'branch':
                param['description'] = "要合并进来的分支 (与提交二选一)"
                if 'requiredIf' in param:
                    del param['requiredIf']
        if not any(p['id'] == 'commit' for p in tool['params']):
            tool['params'].append({
                "id": "commit",
                "type": "string",
                "description": "要合并进来的提交 (与分支二选一)",
                "dynamic": "git_commits",
                "optional": True,
                "showIf": {
                    "paramId": "flags",
                    "excludes": ["--continue", "--abort"]
                }
            })

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated git.json")
