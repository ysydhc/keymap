import json
import glob
import os

files = glob.glob('/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/*.json')
for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    if 'tools' in data:
        for tool in data['tools']:
            for key in ['keys', 'mac', 'description', 'title', 'action']:
                if key in tool and isinstance(tool[key], str):
                    new_val = tool[key].replace('Control', 'Ctrl').replace('control', 'ctrl')
                    if new_val != tool[key]:
                        tool[key] = new_val
                        modified = True
                        
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {os.path.basename(file_path)}")
