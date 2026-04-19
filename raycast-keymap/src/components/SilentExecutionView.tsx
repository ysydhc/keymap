import { Detail, ActionPanel, Action, Icon, getPreferenceValues } from "@raycast/api";
import { useEffect, useState } from "react";
import { exec } from "child_process";
import { getActiveAppPath } from "../utils";
import * as os from "os";
import * as fs from "fs";

interface SilentExecutionViewProps {
  cmd: string;
  title: string;
}

export function SilentExecutionView({ cmd, title }: SilentExecutionViewProps) {
  const [output, setOutput] = useState<string>("Executing...");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveAppPath().then(activePath => {
      let cwd = os.homedir();
      if (activePath && fs.existsSync(activePath)) {
        cwd = activePath;
      }
      const prefs = getPreferenceValues<{ defaultShell?: string }>();
      const userShell = prefs.defaultShell || process.env.SHELL || '/bin/zsh';
      const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/Library/Android/sdk/platform-tools:${process.env.PATH}` };
      
      exec(cmd, { env, cwd, shell: userShell }, (err, stdout, stderr) => {
        setIsLoading(false);
        if (err) {
          setError(err.message);
          setOutput(stderr || stdout || err.message);
        } else {
          setOutput(stdout || stderr || "Command executed successfully with no output.");
        }
      });
    });
  }, [cmd]);

  const markdown = `
# ${title}

**Command:**
\`\`\`bash
${cmd}
\`\`\`

**Output:**
\`\`\`text
${output}
\`\`\`
  `;

  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Output" content={output} />
          <Action.CopyToClipboard title="Copy Command" content={cmd} shortcut={{ modifiers: ["cmd"], key: "c" }} />
        </ActionPanel>
      }
    />
  );
}
