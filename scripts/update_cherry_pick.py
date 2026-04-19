import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'git-cherry-pick':
        tool['cmd'] = 'git cherry-pick {flags} {commit} {branch}'
        for param in tool['params']:
            if param['id'] == 'commit':
                param['description'] = "目标提交 (与分支二选一)"
                if 'requiredIf' in param:
                    del param['requiredIf']
        # Add branch
        if not any(p['id'] == 'branch' for p in tool['params']):
            tool['params'].append({
                "id": "branch",
                "type": "string",
                "description": "目标分支 (与提交二选一)",
                "dynamic": "git_branches",
                "optional": True,
                "showIf": {
                    "paramId": "flags",
                    "excludes": ["--continue", "--abort", "--skip"]
                }
            })
            
    elif tool['id'] == 'git-revert':
        tool['cmd'] = 'git revert {commit} {branch}'
        for param in tool['params']:
            if param['id'] == 'commit':
                param['description'] = "目标提交 (与分支二选一)"
                param['optional'] = True
        if not any(p['id'] == 'branch' for p in tool['params']):
            tool['params'].append({
                "id": "branch",
                "type": "string",
                "description": "目标分支 (与提交二选一)",
                "dynamic": "git_branches",
                "optional": True
            })
            
    elif tool['id'] == 'git-reset':
        tool['cmd'] = 'git reset {mode} {commit} {branch} {path}'
        for param in tool['params']:
            if param['id'] == 'commit':
                param['description'] = "目标提交 (与分支二选一)"
                param['optional'] = True
        if not any(p['id'] == 'branch' for p in tool['params']):
            # insert before path if possible
            tool['params'].insert(-1, {
                "id": "branch",
                "type": "string",
                "description": "目标分支 (与提交二选一)",
                "dynamic": "git_branches",
                "optional": True
            })

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated git.json")
