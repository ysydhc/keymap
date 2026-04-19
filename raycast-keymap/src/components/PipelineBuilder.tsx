import { List, ActionPanel, Action, Icon, useNavigation, Form } from "@raycast/api";
import { useState, useMemo } from "react";
import { Tool, Param, WorkflowStep } from "../types";
import { getTools } from "../utils";
import { CreateAliasForm } from "./CreateAliasForm";

function CustomCommandForm({ onSave, initialStep }: { onSave: (step: WorkflowStep) => void, initialStep?: WorkflowStep }) {
  const { pop } = useNavigation();
  const [name, setName] = useState(initialStep?.name || "");
  const [cmd, setCmd] = useState(initialStep?.cmd || "");

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={initialStep ? "Save Step" : "Add Custom Step"}
            icon={initialStep ? Icon.SaveDocument : Icon.Plus}
            onSubmit={() => {
              onSave({
                id: initialStep ? initialStep.id : Date.now().toString(),
                name: name.trim() || cmd.trim(),
                cmd: cmd.trim(),
                originalToolIds: initialStep?.originalToolIds
              });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Step Name (Optional)" placeholder="e.g. Go to Project Dir" value={name} onChange={setName} />
      <Form.TextArea id="cmd" title="Command" placeholder="e.g. cd /var/www/html" value={cmd} onChange={setCmd} autoFocus />
    </Form>
  );
}

function ToolPicker({ onSelect }: { onSelect: (tool: Tool) => void }) {
  const { pop } = useNavigation();
  const tools = useMemo(() => getTools(), []);
  const [searchText, setSearchText] = useState("");

  const filteredTools = useMemo(() => {
    if (!searchText) return tools;
    const lowerSearch = searchText.toLowerCase();
    return tools.filter(t => 
      t.title.toLowerCase().includes(lowerSearch) || 
      t.cmd.toLowerCase().includes(lowerSearch) ||
      (t.aliases && t.aliases.some(a => a.toLowerCase().includes(lowerSearch)))
    );
  }, [tools, searchText]);

  return (
    <List searchBarPlaceholder="Search command to add to pipeline..." onSearchTextChange={setSearchText}>
      {filteredTools.map(t => (
        <List.Item
          key={t.id}
          icon={Icon.Terminal}
          title={t.title}
          subtitle={t.cmd}
          accessories={[{ text: t.category }]}
          actions={
            <ActionPanel>
              <Action title="Select Command" icon={Icon.Checkmark} onAction={() => { onSelect(t); pop(); }} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export function PipelineBuilder({ onSaved, initialWorkflow }: { onSaved: () => void, initialWorkflow?: Tool }) {
  const { push } = useNavigation();
  const [steps, setSteps] = useState<WorkflowStep[]>(initialWorkflow?.steps || []);

  const handleAddToolStep = (tool: Tool) => {
    setSteps([...steps, {
      id: Date.now().toString(),
      name: tool.title,
      cmd: tool.cmd,
      originalToolIds: [tool.id]
    }]);
  };

  const handleAddCustomStep = (step: WorkflowStep) => {
    setSteps([...steps, step]);
  };

  const handleMergeWithPrevious = (index: number) => {
    const newSteps = [...steps];
    const current = newSteps[index];
    const prev = newSteps[index - 1];
    
    const prevIds = prev.originalToolIds || (prev.originalToolId ? [prev.originalToolId] : []);
    const currIds = current.originalToolIds || (current.originalToolId ? [current.originalToolId] : []);
    
    newSteps[index - 1] = {
      id: prev.id,
      name: `${prev.name} && ${current.name}`,
      cmd: `${prev.cmd} && ${current.cmd}`,
      originalToolIds: [...prevIds, ...currIds]
    };
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const handleRemoveStep = (index: number) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const handleEditStep = (index: number, updatedStep: WorkflowStep) => {
    const newSteps = [...steps];
    newSteps[index] = updatedStep;
    setSteps(newSteps);
  };

  const combinedCmd = steps.map(s => s.cmd).join(" && ");

  // Merge and deduplicate parameters
  const mergedParams: Param[] = [];
  const seenIds = new Set<string>();
  const tools = getTools();
  
  for (const step of steps) {
    const ids = step.originalToolIds || (step.originalToolId ? [step.originalToolId] : []);
    for (const id of ids) {
      const tool = tools.find(t => t.id === id);
      if (tool && tool.params) {
        for (const p of tool.params) {
          if (!seenIds.has(p.id)) {
            mergedParams.push(p);
            seenIds.add(p.id);
          }
        }
      }
    }
  }

  return (
    <List navigationTitle="Pipeline Builder (调用链组装器)">
      <List.Section title="Pipeline Steps (按顺序执行)">
        {steps.map((step, index) => (
          <List.Item
            key={step.id}
            icon={Icon.Terminal}
            title={`Step ${index + 1}: ${step.name}`}
            subtitle={step.cmd}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Pipeline Actions">
                  <Action.Push title="Edit Step" icon={Icon.Pencil} target={<CustomCommandForm initialStep={step} onSave={(updated) => handleEditStep(index, updated)} />} />
                  <Action.Push title="Add Next Command (From Library)" icon={Icon.Plus} target={<ToolPicker onSelect={handleAddToolStep} />} />
                  <Action.Push title="Add Custom Command (Manual Input)" icon={Icon.PlusCircle} target={<CustomCommandForm onSave={handleAddCustomStep} />} shortcut={{ modifiers: ["cmd"], key: "n" }} />
                  {index > 0 && (
                    <Action title="Merge with Previous Step (&&)" icon={Icon.Link} shortcut={{ modifiers: ["cmd"], key: "m" }} onAction={() => handleMergeWithPrevious(index)} />
                  )}
                  <Action title="Remove Step" icon={Icon.Trash} shortcut={{ modifiers: ["ctrl"], key: "x" }} style={Action.Style.Destructive} onAction={() => handleRemoveStep(index)} />
                </ActionPanel.Section>
                {steps.length > 0 && (
                  <ActionPanel.Section title="Finish">
                    <Action.Push
                      title="Save Pipeline as Workflow"
                      icon={Icon.SaveDocument}
                      shortcut={{ modifiers: ["cmd"], key: "s" }}
                      target={<CreateAliasForm existingTool={initialWorkflow} initialCmd="[Workflow]" initialParams={mergedParams} isWorkflow={true} workflowSteps={steps} onSaved={onSaved} />}
                    />
                  </ActionPanel.Section>
                )}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      
      <List.Section title="Actions">
        <List.Item
          icon={Icon.Plus}
          title={steps.length === 0 ? "Add First Command (From Library)..." : "Add Next Command (From Library)..."}
          actions={
            <ActionPanel>
              <Action.Push title="Add Command" icon={Icon.Plus} target={<ToolPicker onSelect={handleAddToolStep} />} />
              <Action.Push title="Add Custom Command" icon={Icon.Pencil} target={<CustomCommandForm onSave={handleAddCustomStep} />} shortcut={{ modifiers: ["cmd"], key: "n" }} />
              {steps.length > 0 && (
                <Action.Push
                  title="Save Pipeline as Workflow"
                  icon={Icon.SaveDocument}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                  target={<CreateAliasForm existingTool={initialWorkflow} initialCmd="[Workflow]" initialParams={mergedParams} isWorkflow={true} workflowSteps={steps} onSaved={onSaved} />}
                />
              )}
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.Pencil}
          title={steps.length === 0 ? "Add Custom Command (Manual Input)..." : "Add Custom Command (Manual Input)..."}
          actions={
            <ActionPanel>
              <Action.Push title="Add Custom Command" icon={Icon.Pencil} target={<CustomCommandForm onSave={handleAddCustomStep} />} />
              <Action.Push title="Add Command (From Library)" icon={Icon.Plus} target={<ToolPicker onSelect={handleAddToolStep} />} shortcut={{ modifiers: ["cmd"], key: "n" }} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
