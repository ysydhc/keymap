import json
import os

updates = {
    'git-remote': {
        'title': '远程仓库管理 (git remote)',
        'cmd': 'git remote {subcommand} {name} {url}',
        'params': [
            {
                "id": "subcommand", "type": "string", "description": "操作类型",
                "options": [
                    {"title": "查看列表 (-v)", "value": "-v"},
                    {"title": "添加远程 (add)", "value": "add"},
                    {"title": "删除远程 (remove)", "value": "remove"},
                    {"title": "修改地址 (set-url)", "value": "set-url"},
                    {"title": "重命名 (rename)", "value": "rename"}
                ]
            },
            {
                "id": "name", "type": "string", "description": "远程名称 (如 origin)",
                "dynamic": "git_remotes", "optional": True,
                "showIf": { "paramId": "subcommand", "excludes": ["-v"] },
                "requiredIf": { "paramId": "subcommand", "includes": ["add", "remove", "set-url", "rename"] }
            },
            {
                "id": "url", "type": "string", "description": "远程 URL 地址", "optional": True,
                "showIf": { "paramId": "subcommand", "includes": ["add", "set-url"] },
                "requiredIf": { "paramId": "subcommand", "includes": ["add", "set-url"] }
            }
        ]
    },
    'git-tag': {
        'title': '标签管理 (git tag)',
        'cmd': 'git tag {flags} {tag_name} {commit}',
        'params': [
            {
                "id": "flags", "type": "flags", "description": "操作类型", "optional": True,
                "options": [
                    {"title": "添加附注标签 (-a)", "value": "-a"},
                    {"title": "删除标签 (-d) [互斥]", "value": "-d"},
                    {"title": "列出标签 (-l) [互斥]", "value": "-l"}
                ]
            },
            {
                "id": "tag_name", "type": "string", "description": "标签名称 (如 v1.0.0)", "optional": True,
                "showIf": { "paramId": "flags", "excludes": ["-l"] },
                "requiredIf": { "paramId": "flags", "includes": ["-a", "-d"] }
            },
            {
                "id": "commit", "type": "string", "description": "目标提交 (可选，默认 HEAD)",
                "dynamic": "git_commits", "optional": True,
                "showIf": { "paramId": "flags", "excludes": ["-d", "-l"] }
            }
        ]
    },
    'git-cherry-pick': {
        'title': '拣选提交 (git cherry-pick)',
        'cmd': 'git cherry-pick {flags} {commit}',
        'params': [
            {
                "id": "flags", "type": "flags", "description": "附加参数 / 流程控制", "optional": True,
                "options": [
                    {"title": "仅应用不提交 (-n)", "value": "-n"},
                    {"title": "继续拣选 (--continue) [互斥]", "value": "--continue"},
                    {"title": "放弃拣选 (--abort) [互斥]", "value": "--abort"},
                    {"title": "跳过当前 (--skip) [互斥]", "value": "--skip"}
                ]
            },
            {
                "id": "commit", "type": "string", "description": "目标提交",
                "dynamic": "git_commits", "optional": True,
                "showIf": { "paramId": "flags", "excludes": ["--continue", "--abort", "--skip"] },
                "requiredIf": { "paramId": "flags", "excludes": ["--continue", "--abort", "--skip"] }
            }
        ]
    },
    'git-rebase': {
        'title': '变基 (git rebase)',
        'cmd': 'git rebase {flags} {branch}',
        'params': [
            {
                "id": "flags", "type": "flags", "description": "附加参数 / 流程控制", "optional": True,
                "options": [
                    {"title": "交互式变基 (-i)", "value": "-i"},
                    {"title": "保留合并提交 (--rebase-merges)", "value": "--rebase-merges"},
                    {"title": "继续变基 (--continue) [互斥]", "value": "--continue"},
                    {"title": "放弃变基 (--abort) [互斥]", "value": "--abort"},
                    {"title": "跳过当前 (--skip) [互斥]", "value": "--skip"}
                ]
            },
            {
                "id": "branch", "type": "string", "description": "基线分支",
                "dynamic": "git_branches", "optional": True,
                "showIf": { "paramId": "flags", "excludes": ["--continue", "--abort", "--skip"] },
                "requiredIf": { "paramId": "flags", "excludes": ["--continue", "--abort", "--skip"] }
            }
        ]
    },
    'git-merge': {
        'title': '合并分支 (git merge)',
        'cmd': 'git merge {flags} {branch}',
        'params': [
            {
                "id": "flags", "type": "flags", "description": "附加参数 / 流程控制", "optional": True,
                "options": [
                    {"title": "禁用快进，强制生成合并提交 (--no-ff)", "value": "--no-ff"},
                    {"title": "压缩为一次提交 (--squash)", "value": "--squash"},
                    {"title": "继续合并 (--continue) [互斥]", "value": "--continue"},
                    {"title": "放弃合并 (--abort) [互斥]", "value": "--abort"}
                ]
            },
            {
                "id": "branch", "type": "string", "description": "要合并进来的分支",
                "dynamic": "git_branches", "optional": True,
                "showIf": { "paramId": "flags", "excludes": ["--continue", "--abort"] },
                "requiredIf": { "paramId": "flags", "excludes": ["--continue", "--abort"] }
            }
        ]
    },
    'git-stash-pop': {
        'params': [
            {
                "id": "stash_id", "type": "string", "description": "选择要恢复的贮藏 (可选，默认最新)",
                "dynamic": "git_stashes", "optional": True
            }
        ]
    }
}

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

modified = False
for tool in data.get('tools', []):
    if tool['id'] in updates:
        update_info = updates[tool['id']]
        if 'title' in update_info: tool['title'] = update_info['title']
        if 'cmd' in update_info: tool['cmd'] = update_info['cmd']
        if 'params' in update_info: tool['params'] = update_info['params']
        modified = True

if modified:
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Updated git.json with deep conditions")

