import json
import glob
import os

files = glob.glob('/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/*.json')

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except:
            continue
            
    modified = False
    if 'tools' in data:
        for tool in data['tools']:
            # DOCKER
            if tool['id'] == 'docker-run':
                tool['cmd'] = 'docker run {flags} {image}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数 (带 [互斥] 标签的请勿同时勾选)",
                      "optional": True,
                      "options": [
                        { "title": "后台运行 (-d) [与-it互斥]", "value": "-d" },
                        { "title": "交互模式 (-it) [与-d互斥]", "value": "-it" },
                        { "title": "退出后自动删除 (--rm)", "value": "--rm" },
                        { "title": "端口映射 (-p 8080:80)", "value": "-p 8080:80" }
                      ]
                    },
                    { "id": "image", "type": "string", "description": "镜像名称", "dynamic": "docker_images" }
                ]
                modified = True
            elif tool['id'] == 'docker-ps':
                tool['cmd'] = 'docker ps {flags}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "显示所有容器 (-a)", "value": "-a" },
                        { "title": "仅显示 ID (-q)", "value": "-q" },
                        { "title": "🌟 显示所有容器 ID (-a -q)", "value": "-a -q" }
                      ]
                    }
                ]
                modified = True
            elif tool['id'] == 'docker-rm':
                tool['cmd'] = 'docker rm {flags} {container}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "强制删除 (-f)", "value": "-f" },
                        { "title": "同时删除匿名卷 (-v)", "value": "-v" },
                        { "title": "🌟 强制删除并清理卷 (-f -v)", "value": "-f -v" }
                      ]
                    },
                    tool.get('params', [{}])[0] if 'params' in tool else { "id": "container", "type": "string", "description": "容器", "dynamic": "docker_containers_all" }
                ]
                modified = True
            elif tool['id'] == 'docker-rmi':
                tool['cmd'] = 'docker rmi {flags} {image}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "强制删除 (-f)", "value": "-f" }
                      ]
                    },
                    tool.get('params', [{}])[0] if 'params' in tool else { "id": "image", "type": "string", "description": "镜像", "dynamic": "docker_images" }
                ]
                modified = True
            elif tool['id'] == 'docker-exec':
                tool['cmd'] = 'docker exec {flags} {container} {command}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数 (带 [互斥] 标签的请勿同时勾选)",
                      "optional": True,
                      "options": [
                        { "title": "交互模式 (-it) [与-d互斥]", "value": "-it" },
                        { "title": "后台运行 (-d) [与-it互斥]", "value": "-d" }
                      ]
                    },
                    { "id": "container", "type": "string", "description": "容器", "dynamic": "docker_containers" },
                    { "id": "command", "type": "string", "description": "执行的命令 (如 sh, bash)", "values": ["sh", "bash"] }
                ]
                modified = True
            elif tool['id'] == 'docker-logs':
                tool['cmd'] = 'docker logs {flags} {container}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "跟随输出 (-f)", "value": "-f" },
                        { "title": "显示时间戳 (-t)", "value": "-t" },
                        { "title": "最后 100 行 (--tail 100)", "value": "--tail 100" },
                        { "title": "🌟 跟随并看最后 100 行 (-f --tail 100)", "value": "-f --tail 100" }
                      ]
                    },
                    { "id": "container", "type": "string", "description": "容器", "dynamic": "docker_containers" }
                ]
                modified = True
            
            # NODE / NPM
            elif tool['id'] == 'npm-install':
                tool['cmd'] = 'npm install {flags} {package}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数 (带 [互斥] 标签的请勿同时勾选)",
                      "optional": True,
                      "options": [
                        { "title": "开发依赖 (-D) [与-g互斥]", "value": "-D" },
                        { "title": "全局安装 (-g) [与-D互斥]", "value": "-g" },
                        { "title": "精确版本 (-E)", "value": "-E" },
                        { "title": "不保存到 package.json (--no-save)", "value": "--no-save" }
                      ]
                    },
                    { "id": "package", "type": "string", "description": "包名 (留空则安装全部依赖)", "optional": True }
                ]
                modified = True
            elif tool['id'] == 'npm-uninstall':
                tool['cmd'] = 'npm uninstall {flags} {package}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数 (带 [互斥] 标签的请勿同时勾选)",
                      "optional": True,
                      "options": [
                        { "title": "开发依赖 (-D) [与-g互斥]", "value": "-D" },
                        { "title": "全局卸载 (-g) [与-D互斥]", "value": "-g" }
                      ]
                    },
                    tool.get('params', [{}])[0] if 'params' in tool else { "id": "package", "type": "string", "description": "包名", "dynamic": "npm_dependencies" }
                ]
                modified = True

            # MACOS
            elif tool['id'] == 'mac-ls' or tool['id'] == 'ls':
                tool['cmd'] = 'ls {flags} {path}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "长格式列表 (-l)", "value": "-l" },
                        { "title": "显示隐藏文件 (-a)", "value": "-a" },
                        { "title": "人类可读大小 (-h)", "value": "-h" },
                        { "title": "🌟 详细列表 (-lah)", "value": "-lah" }
                      ]
                    },
                    { "id": "path", "type": "string", "description": "路径", "dynamic": "file_path", "optional": True }
                ]
                modified = True
            elif tool['id'] == 'mac-grep':
                tool['cmd'] = 'grep {flags} "{text}" {path}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "递归搜索 (-r)", "value": "-r" },
                        { "title": "显示行号 (-n)", "value": "-n" },
                        { "title": "忽略大小写 (-i)", "value": "-i" },
                        { "title": "反向匹配 (-v)", "value": "-v" },
                        { "title": "🌟 递归并显示行号 (-rn)", "value": "-rn" }
                      ]
                    },
                    { "id": "text", "type": "string", "description": "搜索文本" },
                    { "id": "path", "type": "string", "description": "搜索路径 (默认当前目录 .)", "values": ["."] }
                ]
                modified = True
            
            # K8S
            elif tool['id'] == 'kubectl-logs':
                tool['cmd'] = 'kubectl logs {flags} {pod} -n {namespace}'
                tool['params'] = [
                    {
                      "id": "flags",
                      "type": "flags",
                      "description": "附加参数",
                      "optional": True,
                      "options": [
                        { "title": "跟随输出 (-f)", "value": "-f" },
                        { "title": "最后 100 行 (--tail 100)", "value": "--tail 100" },
                        { "title": "🌟 跟随并看最后 100 行 (-f --tail 100)", "value": "-f --tail 100" }
                      ]
                    },
                    { "id": "namespace", "type": "string", "description": "选择命名空间", "dynamic": "k8s_namespaces" },
                    { "id": "pod", "type": "string", "description": "选择 Pod", "dynamic": "k8s_pods" }
                ]
                modified = True

    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {os.path.basename(file_path)}")

