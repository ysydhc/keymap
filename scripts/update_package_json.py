import json

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/package.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Add AI preferences
new_prefs = [
    {
      "name": "aiBaseUrl",
      "type": "textfield",
      "required": False,
      "title": "AI Base URL",
      "description": "OpenAI-compatible API Base URL (e.g., http://localhost:11434/v1 for Ollama)",
      "default": "https://api.openai.com/v1"
    },
    {
      "name": "aiApiKey",
      "type": "password",
      "required": False,
      "title": "AI API Key",
      "description": "API Key for the AI service (leave empty for local Ollama)"
    },
    {
      "name": "aiModel",
      "type": "textfield",
      "required": False,
      "title": "AI Model",
      "description": "Model name (e.g., gpt-4o, llama3)",
      "default": "gpt-4o"
    }
]

# Check if already added
existing_names = [p['name'] for p in data.get('preferences', [])]
for pref in new_prefs:
    if pref['name'] not in existing_names:
        data['preferences'].append(pref)

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated package.json")
