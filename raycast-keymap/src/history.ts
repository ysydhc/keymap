import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getPreferenceValues, LocalStorage } from '@raycast/api';

const MAX_HISTORY = 100;

export async function removeCommandFromHistory(cmd: string) {
  if (!cmd) return;

  // 1. Remove from Raycast history
  const historyStr = await LocalStorage.getItem<string>('km_command_history');
  if (historyStr) {
    try {
      let history: string[] = JSON.parse(historyStr);
      history = history.filter(h => h !== cmd);
      await LocalStorage.setItem('km_command_history', JSON.stringify(history));
    } catch (e) {}
  }

  // 2. Add to hidden list (to mask shell history)
  const hiddenStr = await LocalStorage.getItem<string>('km_hidden_history');
  let hidden: string[] = [];
  if (hiddenStr) {
    try { hidden = JSON.parse(hiddenStr); } catch (e) {}
  }
  if (!hidden.includes(cmd)) {
    hidden.push(cmd);
    if (hidden.length > 1000) hidden = hidden.slice(hidden.length - 1000);
    await LocalStorage.setItem('km_hidden_history', JSON.stringify(hidden));
  }
}

export async function saveCommandHistory(cmd: string) {
  if (!cmd || !cmd.trim()) return;
  const historyStr = await LocalStorage.getItem<string>('km_command_history');
  let history: string[] = [];
  if (historyStr) {
    try { history = JSON.parse(historyStr); } catch (e) {}
  }
  history = [cmd, ...history.filter(h => h !== cmd)].slice(0, MAX_HISTORY);
  await LocalStorage.setItem('km_command_history', JSON.stringify(history));
}

export async function getCommandHistory(): Promise<string[]> {
  // 1. Get Raycast History
  const historyStr = await LocalStorage.getItem<string>('km_command_history');
  let raycastHistory: string[] = [];
  if (historyStr) {
    try { raycastHistory = JSON.parse(historyStr); } catch (e) {}
  }

  // 2. Get Shell History
  const prefs = getPreferenceValues<{ defaultShell?: string }>();
  const userShell = prefs.defaultShell || process.env.SHELL || '';
  let shellHistory: string[] = [];

  try {
    // Read Fish history
    const fishPath = path.join(os.homedir(), '.local/share/fish/fish_history');
    if (fs.existsSync(fishPath)) {
      const content = fs.readFileSync(fishPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('- cmd: ')) {
          shellHistory.push(line.substring(7).trim());
        }
        if (shellHistory.length >= MAX_HISTORY) break;
      }
    }

    // Read Zsh history
    const zshPath = path.join(os.homedir(), '.zsh_history');
    if (fs.existsSync(zshPath)) {
      const content = fs.readFileSync(zshPath, 'utf-8');
      const lines = content.split('\n');
      let zshCount = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith(': ')) {
          const parts = line.split(';');
          if (parts.length >= 2) {
            shellHistory.push(parts.slice(1).join(';').trim());
            zshCount++;
          }
        } else {
          shellHistory.push(line);
          zshCount++;
        }
        if (zshCount >= MAX_HISTORY) break;
      }
    }

    // Read Bash history
    const bashPath = path.join(os.homedir(), '.bash_history');
    if (fs.existsSync(bashPath)) {
      const content = fs.readFileSync(bashPath, 'utf-8');
      const lines = content.split('\n');
      let bashCount = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line) {
          shellHistory.push(line);
          bashCount++;
        }
        if (bashCount >= MAX_HISTORY) break;
      }
    }
  } catch (e) {
    console.error("Error reading shell history:", e);
  }

  // Merge and deduplicate (Raycast history takes precedence)
  const merged = [...raycastHistory, ...shellHistory];
  
  // Filter out hidden commands
  const hiddenStr = await LocalStorage.getItem<string>('km_hidden_history');
  let hidden: string[] = [];
  if (hiddenStr) {
    try { hidden = JSON.parse(hiddenStr); } catch (e) {}
  }
  
  return Array.from(new Set(merged)).filter(cmd => !hidden.includes(cmd)).slice(0, MAX_HISTORY);
}
