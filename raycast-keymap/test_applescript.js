const { execSync } = require('child_process');
const script = `
  tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
  end tell
  set currentPath to ""
  try
    if frontApp is "Finder" then
      tell application "Finder" to set currentPath to POSIX path of (insertion location as alias)
    end if
  end try
  return frontApp & "|" & currentPath
`;
console.log(execSync(`osascript -e '${script}'`).toString().trim());
