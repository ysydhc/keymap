import json
import os
import re
import glob

def parse_mac_key(keys_str):
    if not keys_str:
        return ""
    
    # Handle specific known complex cases
    if "连按两次 Shift" in keys_str:
        return "Shift+Shift"
    
    if "复制行" in keys_str and "删除行" in keys_str:
        parts = []
        for p in re.split(r'[;；]', keys_str):
            if "Windows" in p or "Linux" in p:
                continue
            clean = re.sub(r'macOS[:：]?\s*', '', p, flags=re.IGNORECASE).strip()
            parts.append(clean)
        return "；".join(parts)
        
    # General parsing
    match = re.search(r'macOS[:：]\s*([^;；]+)', keys_str, re.IGNORECASE)
    if match:
        return match.group(1).strip()
        
    parts = re.split(r'[;；]', keys_str)
    first_part = parts[0]
    
    if "Windows" in first_part or "Linux" in first_part:
        return first_part.strip()
        
    clean = re.sub(r'macOS[:：]?\s*', '', first_part, flags=re.IGNORECASE).strip()
    return clean

def main():
    files = glob.glob('/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/*.json')
    for file_path in files:
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                continue
                
        modified = False
        if 'tools' in data:
            for tool in data['tools']:
                if 'keys' in tool and tool.get('mode') != 'cli':
                    mac_key = parse_mac_key(tool['keys'])
                    if mac_key:
                        tool['mac'] = mac_key
                        modified = True
                            
        if modified:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Updated {os.path.basename(file_path)}")

if __name__ == "__main__":
    main()
