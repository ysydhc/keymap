import json
import os

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/books/ai_generated.json'
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for book in data.get('books', []):
        if book['target'].startswith('docs/'):
            book['target'] = '~/Work/agent/MyGuguGaga/key_map/books/' + book['target']
            
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Fixed ai_generated.json")
