import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'git-branch':
        tool['cmd'] = 'git branch {flags} {branch} {base_branch}'
        # Check if base_branch exists
        if not any(p['id'] == 'base_branch' for p in tool['params']):
            tool['params'].append({
                "id": "base_branch",
                "type": "string",
                "description": "基于哪个分支 (新建分支时可选)",
                "dynamic": "git_branches",
                "optional": True
            })
    elif tool['id'] == 'git-checkout':
        tool['cmd'] = 'git checkout {flags} {branch} {base_branch}'
        if not any(p['id'] == 'base_branch' for p in tool['params']):
            tool['params'].append({
                "id": "base_branch",
                "type": "string",
                "description": "基于哪个分支 (新建分支时可选)",
                "dynamic": "git_branches",
                "optional": True
            })
    elif tool['id'] == 'git-log':
        tool['cmd'] = 'git log {flags} {path}'
        if not any(p['id'] == 'path' for p in tool['params']):
            tool['params'].append({
                "id": "path",
                "type": "string",
                "description": "特定文件或目录 (可选)",
                "dynamic": "file_path",
                "optional": True
            })
    elif tool['id'] == 'git-diff':
        tool['cmd'] = 'git diff {flags} {commit1} {commit2} {path}'
        tool['params'] = [p for p in tool.get('params', []) if p['id'] == 'flags']
        tool['params'].extend([
            {
                "id": "commit1",
                "type": "string",
                "description": "对比的提交1 (可选)",
                "dynamic": "git_commits",
                "optional": True
            },
            {
                "id": "commit2",
                "type": "string",
                "description": "对比的提交2 (可选)",
                "dynamic": "git_commits",
                "optional": True
            },
            {
                "id": "path",
                "type": "string",
                "description": "特定文件或目录 (可选)",
                "dynamic": "file_path",
                "optional": True
            }
        ])
    elif tool['id'] == 'git-reset':
        tool['cmd'] = 'git reset {mode} {commit} {path}'
        if not any(p['id'] == 'path' for p in tool['params']):
            tool['params'].append({
                "id": "path",
                "type": "string",
                "description": "特定文件 (可选，仅限 mixed 模式)",
                "dynamic": "file_path",
                "optional": True
            })

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated git.json")
