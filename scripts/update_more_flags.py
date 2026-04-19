import json
import os

updates = {
    'git.json': {
        'git-push': {
            'cmd': 'git push {flags} {remote} {branch}',
            'flags': [
                {"title": "强制推送 (-f)", "value": "-f"},
                {"title": "设置上游关联 (-u)", "value": "-u"},
                {"title": "推送标签 (--tags)", "value": "--tags"}
            ]
        },
        'git-pull': {
            'cmd': 'git pull {flags} {remote} {branch}',
            'flags': [
                {"title": "使用变基合并 (--rebase)", "value": "--rebase"},
                {"title": "仅快进合并 (--ff-only)", "value": "--ff-only"}
            ]
        },
        'git-clean': {
            'cmd': 'git clean {flags}',
            'flags': [
                {"title": "强制删除 (-f)", "value": "-f"},
                {"title": "包含未跟踪目录 (-d)", "value": "-d"},
                {"title": "干跑/预览 (-n)", "value": "-n"},
                {"title": "包含被忽略的文件 (-x)", "value": "-x"},
                {"title": "🌟 强制清理文件和目录 (-fd)", "value": "-fd"},
                {"title": "🌟 彻底清理(含忽略文件) (-fdx)", "value": "-fdx"}
            ]
        },
        'git-diff': {
            'cmd': 'git diff {flags}',
            'flags': [
                {"title": "查看已暂存的差异 (--staged)", "value": "--staged"},
                {"title": "仅显示变化的文件名 (--name-only)", "value": "--name-only"},
                {"title": "显示修改统计 (--stat)", "value": "--stat"}
            ]
        }
    },
    'docker.json': {
        'docker-compose-up': {
            'cmd': 'docker compose up {flags}',
            'flags': [
                {"title": "后台运行 (-d)", "value": "-d"},
                {"title": "启动前重新构建 (--build)", "value": "--build"},
                {"title": "强制重新创建容器 (--force-recreate)", "value": "--force-recreate"},
                {"title": "🌟 后台运行并重新构建 (-d --build)", "value": "-d --build"}
            ]
        },
        'docker-compose-down': {
            'cmd': 'docker compose down {flags}',
            'flags': [
                {"title": "同时删除命名卷 (-v)", "value": "-v"},
                {"title": "删除所有相关镜像 (--rmi all)", "value": "--rmi all"},
                {"title": "删除孤立容器 (--remove-orphans)", "value": "--remove-orphans"}
            ]
        }
    },
    'android.json': {
        'adb-install': {
            'cmd': 'adb -s {device} install {flags} {apk}',
            'flags': [
                {"title": "覆盖安装/保留数据 (-r)", "value": "-r"},
                {"title": "允许安装测试包 (-t)", "value": "-t"},
                {"title": "允许降级安装 (-d)", "value": "-d"},
                {"title": "授予所有运行时权限 (-g)", "value": "-g"}
            ]
        },
        'adb-logcat': {
            'cmd': 'adb -s {device} logcat {flags}',
            'flags': [
                {"title": "清空日志缓冲区 (-c)", "value": "-c"},
                {"title": "输出当前日志并退出 (-d)", "value": "-d"}
            ]
        }
    },
    'ssh.json': {
        'ssh-connect': {
            'cmd': 'ssh {flags} {host}',
            'flags': [
                {"title": "详细输出/调试模式 (-v)", "value": "-v"},
                {"title": "开启代理转发 (-A)", "value": "-A"},
                {"title": "请求压缩所有数据 (-C)", "value": "-C"}
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
            
            flag_param = {
                "id": "flags",
                "type": "flags",
                "description": "附加参数 (可多选)",
                "optional": True,
                "options": update_info['flags']
            }
            
            if 'params' not in tool:
                tool['params'] = []
                
            # Remove existing flags param if any
            tool['params'] = [p for p in tool['params'] if p['id'] != 'flags']
            
            # Insert flags at the beginning
            tool['params'].insert(0, flag_param)
            modified = True
            
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {filename}")

