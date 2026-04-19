const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '../../config/keyconfig');
const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));

let silentCount = 0;

for (const file of files) {
  const filePath = path.join(configDir, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    continue;
  }
  
  if (!Array.isArray(data)) {
    if (data.tools && Array.isArray(data.tools)) {
      data = data.tools;
    } else {
      continue;
    }
  }

  for (const tool of data) {
    if (tool.mode === 'silent') {
      console.log(`[${file}] ${tool.id}: ${tool.cmd}`);
      silentCount++;
    }
  }
}

console.log(`Total silent commands: ${silentCount}`);
