import json
import os

updates = {
    'docker.json': {
        'docker-volume': {
            'title': '数据卷管理 (docker volume)',
            'cmd': 'docker volume {subcommand} {name}',
            'params': [
                {
                    "id": "subcommand", "type": "string", "description": "操作类型",
                    "options": [
                        {"title": "列出所有卷 (ls)", "value": "ls"},
                        {"title": "创建新卷 (create)", "value": "create"},
                        {"title": "删除数据卷 (rm)", "value": "rm"},
                        {"title": "查看卷详情 (inspect)", "value": "inspect"},
                        {"title": "清理未使用的卷 (prune)", "value": "prune"}
                    ]
                },
                {
                    "id": "name", "type": "string", "description": "数据卷名称", "optional": True,
                    "showIf": { "paramId": "subcommand", "excludes": ["ls", "prune"] },
                    "requiredIf": { "paramId": "subcommand", "includes": ["create", "rm", "inspect"] }
                }
            ]
        },
        'docker-network': {
            'title': '网络管理 (docker network)',
            'cmd': 'docker network {subcommand} {name}',
            'params': [
                {
                    "id": "subcommand", "type": "string", "description": "操作类型",
                    "options": [
                        {"title": "列出所有网络 (ls)", "value": "ls"},
                        {"title": "创建新网络 (create)", "value": "create"},
                        {"title": "删除网络 (rm)", "value": "rm"},
                        {"title": "查看网络详情 (inspect)", "value": "inspect"},
                        {"title": "清理未使用的网络 (prune)", "value": "prune"}
                    ]
                },
                {
                    "id": "name", "type": "string", "description": "网络名称", "optional": True,
                    "showIf": { "paramId": "subcommand", "excludes": ["ls", "prune"] },
                    "requiredIf": { "paramId": "subcommand", "includes": ["create", "rm", "inspect"] }
                }
            ]
        },
        'docker-context': {
            'title': '上下文管理 (docker context)',
            'cmd': 'docker context {subcommand} {name}',
            'params': [
                {
                    "id": "subcommand", "type": "string", "description": "操作类型",
                    "options": [
                        {"title": "列出上下文 (ls)", "value": "ls"},
                        {"title": "切换上下文 (use)", "value": "use"},
                        {"title": "创建上下文 (create)", "value": "create"},
                        {"title": "删除上下文 (rm)", "value": "rm"},
                        {"title": "查看详情 (inspect)", "value": "inspect"}
                    ]
                },
                {
                    "id": "name", "type": "string", "description": "上下文名称", "optional": True,
                    "showIf": { "paramId": "subcommand", "excludes": ["ls"] },
                    "requiredIf": { "paramId": "subcommand", "includes": ["use", "create", "rm", "inspect"] }
                }
            ]
        },
        'docker-system-prune': {
            'title': '系统清理与空间 (docker system)',
            'cmd': 'docker system {subcommand} {flags}',
            'params': [
                {
                    "id": "subcommand", "type": "string", "description": "操作类型",
                    "options": [
                        {"title": "清理未使用资源 (prune)", "value": "prune"},
                        {"title": "查看磁盘使用情况 (df)", "value": "df"}
                    ]
                },
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "清理所有未使用镜像 (-a)", "value": "-a"},
                        {"title": "同时清理数据卷 (--volumes)", "value": "--volumes"},
                        {"title": "强制执行免确认 (-f)", "value": "-f"},
                        {"title": "🌟 彻底清理所有 (-a --volumes -f)", "value": "-a --volumes -f"}
                    ],
                    "showIf": { "paramId": "subcommand", "includes": ["prune"] }
                }
            ]
        }
    },
    'node.json': {
        'npm-config-registry': {
            'title': 'NPM 镜像源管理 (npm config)',
            'cmd': 'npm config {subcommand} registry {url}',
            'params': [
                {
                    "id": "subcommand", "type": "string", "description": "操作类型",
                    "options": [
                        {"title": "查看当前镜像源 (get)", "value": "get"},
                        {"title": "设置镜像源 (set)", "value": "set"}
                    ]
                },
                {
                    "id": "url", "type": "string", "description": "镜像源地址", "optional": True,
                    "options": [
                        {"title": "官方源 (npmjs)", "value": "https://registry.npmjs.org/"},
                        {"title": "淘宝源 (taobao)", "value": "https://registry.npmmirror.com/"},
                        {"title": "腾讯源 (tencent)", "value": "https://mirrors.cloud.tencent.com/npm/"}
                    ],
                    "showIf": { "paramId": "subcommand", "includes": ["set"] },
                    "requiredIf": { "paramId": "subcommand", "includes": ["set"] }
                }
            ]
        }
    },
    'macos.json': {
        'mac-chmod-x': {
            'title': '修改文件权限 (chmod)',
            'cmd': 'chmod {flags} {mode} {file}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "递归修改目录 (-R)", "value": "-R"}
                    ]
                },
                {
                    "id": "mode", "type": "string", "description": "权限模式",
                    "options": [
                        {"title": "添加执行权限 (+x)", "value": "+x"},
                        {"title": "最高权限 (777)", "value": "777"},
                        {"title": "常见文件权限 (644)", "value": "644"},
                        {"title": "常见目录权限 (755)", "value": "755"}
                    ]
                },
                { "id": "file", "type": "string", "description": "目标文件或目录", "dynamic": "file_path" }
            ]
        }
    }
}

base_dir = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/'

for filename, tools_to_update in updates.items():
    file_path = os.path.join(base_dir, filename)
    if not os.path.exists(file_path): continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    modified = False
    for tool in data.get('tools', []):
        if tool['id'] in tools_to_update:
            update_info = tools_to_update[tool['id']]
            if 'title' in update_info: tool['title'] = update_info['title']
            if 'cmd' in update_info: tool['cmd'] = update_info['cmd']
            if 'params' in update_info: tool['params'] = update_info['params']
            modified = True
            
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {filename} with deep conditions")
