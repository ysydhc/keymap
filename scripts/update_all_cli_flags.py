import json
import os

updates = {
    'macos.json': {
        'mac-find': {
            'cmd': 'find {path} {flags} "{name}"',
            'params': [
                {
                    "id": "path", "type": "string", "description": "搜索目录 (默认当前目录 .)", "values": ["."]
                },
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "按名称 (-name)", "value": "-name"},
                        {"title": "忽略大小写 (-iname)", "value": "-iname"},
                        {"title": "仅查找文件 (-type f)", "value": "-type f"},
                        {"title": "仅查找目录 (-type d)", "value": "-type d"}
                    ]
                },
                {
                    "id": "name", "type": "string", "description": "匹配模式 (如 *.txt)"
                }
            ]
        },
        'mac-tail': {
            'cmd': 'tail {flags} {file}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "持续跟踪 (-f)", "value": "-f"},
                        {"title": "最后 100 行 (-n 100)", "value": "-n 100"}
                    ]
                },
                { "id": "file", "type": "string", "description": "文件路径", "dynamic": "file_path" }
            ]
        },
        'mac-tar-extract': {
            'cmd': 'tar {flags} {file} {dest}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "解压格式", "optional": True,
                    "options": [
                        {"title": "解压 .tar.gz (-zxvf)", "value": "-zxvf"},
                        {"title": "解压 .tar.bz2 (-jxvf)", "value": "-jxvf"},
                        {"title": "解压 .tar (-xvf)", "value": "-xvf"}
                    ]
                },
                { "id": "file", "type": "string", "description": "压缩包文件", "dynamic": "file_path" },
                { "id": "dest", "type": "string", "description": "解压到指定目录 (可选，如 -C /tmp)", "optional": True }
            ]
        },
        'mac-tar-compress': {
            'cmd': 'tar {flags} {archive} {path}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "压缩格式", "optional": True,
                    "options": [
                        {"title": "压缩为 .tar.gz (-zcvf)", "value": "-zcvf"},
                        {"title": "压缩为 .tar.bz2 (-jcvf)", "value": "-jcvf"},
                        {"title": "压缩为 .tar (-cvf)", "value": "-cvf"}
                    ]
                },
                { "id": "archive", "type": "string", "description": "生成的压缩包名 (如 app.tar.gz)" },
                { "id": "path", "type": "string", "description": "要压缩的目录或文件", "dynamic": "file_path" }
            ]
        }
    },
    'node.json': {
        'node-run-file': {
            'cmd': 'node {flags} {file}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "监视文件变化 (--watch)", "value": "--watch"},
                        {"title": "开启调试 (--inspect)", "value": "--inspect"},
                        {"title": "断点调试 (--inspect-brk)", "value": "--inspect-brk"}
                    ]
                },
                { "id": "file", "type": "string", "description": "执行的文件", "dynamic": "file_path" }
            ]
        },
        'npm-run': {
            'cmd': 'npm run {script} {flags}',
            'params': [
                { "id": "script", "type": "string", "description": "npm 脚本", "dynamic": "npm_scripts" },
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "静默输出 (--silent)", "value": "--silent"},
                        {"title": "如果存在则运行 (--if-present)", "value": "--if-present"}
                    ]
                }
            ]
        },
        'npx': {
            'cmd': 'npx {flags} {command}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "自动确认安装 (--yes)", "value": "--yes"},
                        {"title": "拒绝安装 (--no)", "value": "--no"}
                    ]
                },
                { "id": "command", "type": "string", "description": "要执行的命令或包名" }
            ]
        }
    },
    'k8s.json': {
        'kubectl-exec': {
            'cmd': 'kubectl exec {flags} {pod} -n {namespace} -- {command}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "交互模式 (-it)", "value": "-it"}
                    ]
                },
                { "id": "namespace", "type": "string", "description": "命名空间", "dynamic": "k8s_namespaces" },
                { "id": "pod", "type": "string", "description": "Pod 名称", "dynamic": "k8s_pods" },
                { "id": "command", "type": "string", "description": "执行命令", "values": ["sh", "bash", "ls -l"] }
            ]
        }
    },
    'docker.json': {
        'docker-build': {
            'cmd': 'docker build {flags} -t {tag} {path}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "不使用缓存 (--no-cache)", "value": "--no-cache"},
                        {"title": "总是尝试拉取最新基础镜像 (--pull)", "value": "--pull"}
                    ]
                },
                { "id": "tag", "type": "string", "description": "镜像标签 (如 myapp:1.0)" },
                { "id": "path", "type": "string", "description": "构建上下文路径 (默认 .)", "values": ["."] }
            ]
        },
        'docker-system-prune': {
            'cmd': 'docker system prune {flags}',
            'params': [
                {
                    "id": "flags", "type": "flags", "description": "附加参数", "optional": True,
                    "options": [
                        {"title": "清理所有未使用镜像 (-a)", "value": "-a"},
                        {"title": "同时清理数据卷 (--volumes)", "value": "--volumes"},
                        {"title": "强制执行免确认 (-f)", "value": "-f"},
                        {"title": "🌟 彻底清理所有 (-a --volumes -f)", "value": "-a --volumes -f"}
                    ]
                }
            ]
        }
    },
    'android.json': {
        'adb-shell': {
            'cmd': 'adb -s {device} shell {command}',
            'params': [
                { "id": "device", "type": "string", "description": "目标设备", "dynamic": "adb_devices" },
                { "id": "command", "type": "string", "description": "执行的命令 (可选，留空则进入交互式 shell)", "optional": True }
            ]
        }
    }
}

base_dir = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/'

for filename, tools_to_update in updates.items():
    file_path = os.path.join(base_dir, filename)
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    modified = False
    for tool in data.get('tools', []):
        if tool['id'] in tools_to_update:
            update_info = tools_to_update[tool['id']]
            tool['cmd'] = update_info['cmd']
            tool['params'] = update_info['params']
            modified = True
            
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {filename}")

