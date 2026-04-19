import { List, ActionPanel, Action, Icon, LocalStorage, useNavigation, closeMainWindow, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { Tool, WorkflowStep, Param } from "../types";
import { executeInGhostty } from "../ghostty";
import { getTools, replaceGlobalEnvVars } from "../utils";
import Wizard from "./Wizard";

export function WorkflowRunner({ workflow }: { workflow: Tool }) {
  const { push } = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const storageKey = `km_workflow_state_${workflow.id}`;

  useEffect(() => {
    LocalStorage.getItem<number>(storageKey).then(idx => {
      if (idx !== undefined) setCurrentIndex(idx);
    });
  }, []);

  const advance = async (nextIdx: number) => {
    setCurrentIndex(nextIdx);
    if (nextIdx >= workflow.steps!.length) {
      await LocalStorage.removeItem(storageKey);
      await showToast({ style: Toast.Style.Success, title: "Workflow Complete!" });
    } else {
      await LocalStorage.setItem(storageKey, nextIdx);
    }
  };

  const handleReset = async () => {
    await advance(0);
  };

  return (
    <List navigationTitle={`Workflow: ${workflow.title}`}>
      <List.Section title="Steps">
        {workflow.steps!.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          
          const hasParams = step.cmd.includes("{") && step.cmd.includes("}");
          let toolForWizard: Tool | undefined;
          
          if (hasParams) {
            const ids = step.originalToolIds || (step.originalToolId ? [step.originalToolId] : []);
            if (ids.length > 0) {
              const allTools = getTools();
              const stepParams: Param[] = [];
              const seen = new Set<string>();
              for (const id of ids) {
                const t = allTools.find(x => x.id === id);
                if (t && t.params) {
                  for (const p of t.params) {
                    if (!seen.has(p.id)) {
                      stepParams.push(p);
                      seen.add(p.id);
                    }
                  }
                }
              }
              toolForWizard = {
                id: `temp-${step.id}`,
                title: step.name,
                action: "Execute step",
                cmd: step.cmd,
                params: stepParams
              };
            }
          }

          return (
            <List.Item
              key={step.id}
              icon={isPast ? Icon.CheckCircle : isCurrent ? Icon.Play : Icon.Circle}
              title={`${index + 1}. ${step.name}`}
              subtitle={step.cmd}
              actions={
                <ActionPanel>
                  {isCurrent && toolForWizard && (
                    <Action.Push title="Fill Parameters & Next" icon={Icon.List} target={<Wizard tool={toolForWizard} onExecute={() => advance(index + 1)} />} />
                  )}
                  {isCurrent && !toolForWizard && (
                    <>
                      <Action.Paste 
                        title="Paste to Active App & Next" 
                        icon={Icon.Terminal}
                        content={replaceGlobalEnvVars(step.cmd)} 
                        onPaste={() => advance(index + 1)} 
                      />
                      <Action.CopyToClipboard 
                        title="Copy Command & Next" 
                        content={replaceGlobalEnvVars(step.cmd)} 
                        onCopy={() => advance(index + 1)} 
                      />
                      <Action 
                        title="Execute in Terminal & Next" 
                        icon={Icon.Terminal} 
                        shortcut={{ modifiers: ["cmd"], key: "enter" }}
                        onAction={() => {
                          executeInGhostty(replaceGlobalEnvVars(step.cmd));
                          advance(index + 1);
                          closeMainWindow();
                        }} 
                      />
                    </>
                  )}
                  <Action title="Skip Step" icon={Icon.Forward} onAction={() => advance(index + 1)} shortcut={{modifiers: ["cmd"], key: "s"}}/>
                  <Action title="Reset Workflow" icon={Icon.ArrowClockwise} onAction={handleReset} shortcut={{modifiers: ["cmd", "shift"], key: "r"}}/>
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
