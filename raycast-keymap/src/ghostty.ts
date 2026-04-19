import { runAppleScript } from "@raycast/utils";

export async function executeInGhostty(command: string) {
  // Escape quotes and backslashes for AppleScript
  const escapedCmd = command.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  
  const script = `
    tell application "Ghostty"
      activate
    end tell
    
    delay 0.1
    
    tell application "System Events"
      -- Set the clipboard to the command
      set the clipboard to "${escapedCmd}"
      
      -- Paste the command
      keystroke "v" using command down
      
      -- Press enter to execute
      key code 36
    end tell
  `;
  
  await runAppleScript(script);
}
