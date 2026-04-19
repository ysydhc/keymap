import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'git-branch-list':
        tool['id'] = 'git-branch'
        tool['title'] = '分支管理 (git branch)'
        tool['action'] = '列出、创建、删除或重命名分支'
        tool['keys'] = '终端：git branch -a / -d'
        tool['cmd'] = 'git branch {flags} {branch}'
        tool['params'] = [
            {
              "id": "flags",
              "type": "flags",
              "description": "附加参数 (可多选)",
              "optional": True,
              "options": [
                { "title": "查看所有分支 (-a)", "value": "-a" },
                { "title": "查看远程分支 (-r)", "value": "-r" },
                { "title": "显示详细信息 (-v)", "value": "-v" },
                { "title": "删除分支 (-d)", "value": "-d" },
                { "title": "强制删除分支 (-D)", "value": "-D" },
                { "title": "重命名分支 (-m)", "value": "-m" },
                { "title": "强制重命名 (-M)", "value": "-M" },
                { "title": "查看已合并分支 (--merged)", "value": "--merged" },
                { "title": "查看未合并分支 (--no-merged)", "value": "--no-merged" },
                { "title": "显示当前分支名 (--show-current)", "value": "--show-current" }
              ]
            },
            {
              "id": "branch",
              "type": "string",
              "description": "目标分支 (删除/重命名时需要填写)",
              "dynamic": "git_branches",
              "optional": True
            }
        ]
        
    elif tool['id'] == 'git-checkout':
        tool['title'] = '切换/创建分支 (git checkout)'
        tool['action'] = '切换到指定分支，或创建新分支'
        tool['cmd'] = 'git checkout {flags} {branch}'
        tool['params'] = [
            {
              "id": "flags",
              "type": "flags",
              "description": "附加参数 (可多选)",
              "optional": True,
              "options": [
                { "title": "创建并切换 (-b)", "value": "-b" },
                { "title": "强制创建并切换 (-B)", "value": "-B" },
                { "title": "强制切换/丢弃修改 (-f)", "value": "-f" }
              ]
            },
            {
              "id": "branch",
              "type": "string",
              "description": "选择要切换或创建的分支名",
              "dynamic": "git_branches"
            }
        ]
        
    elif tool['id'] == 'git-commit':
        tool['title'] = '提交暂存区 (git commit)'
        tool['cmd'] = 'git commit {flags} -m {message}'
        # Keep existing message param, add flags before it
        msg_param = tool['params'][0] if 'params' in tool and len(tool['params']) > 0 else {
          "id": "message", "type": "brace", "label": "提交说明", "optional": True
        }
        tool['params'] = [
            {
              "id": "flags",
              "type": "flags",
              "description": "附加参数 (可多选)",
              "optional": True,
              "options": [
                { "title": "自动暂存已修改文件 (-a)", "value": "-a" },
                { "title": "追加到上次提交 (--amend)", "value": "--amend" },
                { "title": "跳过 Git Hooks (--no-verify)", "value": "--no-verify" },
                { "title": "允许空提交 (--allow-empty)", "value": "--allow-empty" }
              ]
            },
            msg_param
        ]

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated git.json")
