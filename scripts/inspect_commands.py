import json
import glob

files = glob.glob('/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/examples/*.json')
for f in files:
    with open(f, 'r') as file:
        try:
            data = json.load(file)
            print(f"--- {f.split('/')[-1]} ---")
            for t in data.get('tools', []):
                print(f"  {t['id']}: {t.get('cmd', '')}")
        except:
            pass
