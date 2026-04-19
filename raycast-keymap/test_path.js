const { execSync } = require('child_process');

function getActivePath() {
  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        set frontPid to unix id of first application process whose frontmost is true
      end tell
      return frontApp & "|" & frontPid
    `;
    const output = execSync(`osascript -e '${script}'`).toString().trim();
    const [appName, pid] = output.split('|');
    console.log("App:", appName, "PID:", pid);

    if (appName === "Finder") {
      return execSync(`osascript -e 'tell application "Finder" to get POSIX path of (insertion location as alias)'`).toString().trim();
    } else if (appName === "iTerm2" || appName === "iTerm") {
      return execSync(`osascript -e 'tell application "iTerm" to get variable "PWD" of current session of current window'`).toString().trim();
    } else if (appName === "Ghostty") {
      // Find child processes of Ghostty
      const childPids = execSync(`pgrep -P ${pid}`).toString().trim().split('\n');
      for (const childPid of childPids) {
        if (childPid) {
          try {
            const cwdLine = execSync(`lsof -p ${childPid} -a -d cwd -F n | grep '^n'`).toString().trim();
            if (cwdLine) {
              return cwdLine.substring(1);
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  return "";
}

console.log("Path:", getActivePath());
