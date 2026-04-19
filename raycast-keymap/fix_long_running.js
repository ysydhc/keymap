const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '../../config/keyconfig');
const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));

let changedCount = 0;

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

  let changed = false;

  for (const tool of data) {
    if (tool.mode === 'silent') {
      // Check if it's a long-running command
      const cmd = tool.cmd || '';
      const isLongRunning = 
        cmd.includes(' logs') || 
        cmd.includes(' tail') || 
        cmd.includes(' top') || 
        cmd.includes(' watch ') || 
        cmd.includes(' ping ') || 
        cmd.includes(' serve') || 
        cmd.includes(' run ') || 
        cmd.includes(' start ') || 
        cmd.includes(' exec ') || 
        cmd.includes(' htop') ||
        cmd.includes(' dev') ||
        cmd.includes(' -f ') ||
        cmd.includes(' --follow');

      if (isLongRunning) {
        console.log(`Changing ${tool.id} (${cmd}) from silent to cli`);
        tool.mode = 'cli';
        changed = true;
        changedCount++;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

console.log(`Changed ${changedCount} commands.`);
