import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/kb.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'import { ActionPanel, Action, List, Icon, LaunchProps } from "@raycast/api";',
    'import { ActionPanel, Action, List, Icon, LaunchProps, getPreferenceValues } from "@raycast/api";'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed kb.tsx import")
