import json
import os

updates = {
    'git.json': {
        'git-checkout': {
            'base_branch': {
                'showIf': { 'paramId': 'flags', 'includes': ['-b', '-B'] }
            }
        },
        'git-diff': {
            'commit1': {
                'showIf': { 'paramId': 'flags', 'excludes': ['--staged'] }
            },
            'commit2': {
                'showIf': { 'paramId': 'flags', 'excludes': ['--staged'] }
            }
        },
        'git-reset': {
            'path': {
                'showIf': { 'paramId': 'mode', 'excludes': ['--hard', '--soft'] }
            }
        }
    },
    'node.json': {
        'npm-install': {
            'package': {
                'requiredIf': { 'paramId': 'flags', 'includes': ['-g'] }
            }
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
            param_updates = tools_to_update[tool['id']]
            for param in tool.get('params', []):
                if param['id'] in param_updates:
                    if 'showIf' in param_updates[param['id']]:
                        param['showIf'] = param_updates[param['id']]['showIf']
                    if 'requiredIf' in param_updates[param['id']]:
                        param['requiredIf'] = param_updates[param['id']]['requiredIf']
                    modified = True
                    
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {filename}")
