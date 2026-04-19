import json

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/git.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for tool in data.get('tools', []):
    if tool['id'] == 'git-branch':
        for param in tool.get('params', []):
            if param['id'] == 'flags':
                param['description'] = "附加参数 (带 [互斥] 标签的请勿同时勾选)"
                param['options'] = [
                    { "title": "查看所有分支 (-a)", "value": "-a" },
                    { "title": "查看远程分支 (-r)", "value": "-r" },
                    { "title": "显示详细信息 (-v)", "value": "-v" },
                    { "title": "🌟 查看所有并显示详情 (-a -v)", "value": "-a -v" }, # 组合预设
                    { "title": "删除分支 (-d) [与-D/-m互斥]", "value": "-d" },
                    { "title": "强制删除 (-D) [与-d/-m互斥]", "value": "-D" },
                    { "title": "重命名分支 (-m) [与-d/-D互斥]", "value": "-m" },
                    { "title": "查看已合并分支 (--merged)", "value": "--merged" },
                    { "title": "查看未合并分支 (--no-merged)", "value": "--no-merged" }
                ]
    elif tool['id'] == 'git-checkout':
        for param in tool.get('params', []):
            if param['id'] == 'flags':
                param['description'] = "附加参数 (带 [互斥] 标签的请勿同时勾选)"
                for opt in param.get('options', []):
                    if opt['value'] == '-b': opt['title'] = "创建并切换 (-b) [与-B互斥]"
                    elif opt['value'] == '-B': opt['title'] = "强制创建并切换 (-B) [与-b互斥]"

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
