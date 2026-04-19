import { List, ActionPanel, Action, useNavigation, Clipboard, closeMainWindow, Icon } from "@raycast/api";
import { useState, useEffect } from "react";
import { LocalStorage } from "@raycast/api";
import { Tool, Param } from "../types";
import { getGitDynamicOptionsAsync, DynamicOption } from "../utils";
import { InteractiveFileBrowser } from "./InteractiveFileBrowser";

interface ParamWizardProps {
  tool: Tool;
  stepIndex?: number;
  values?: Record<string, string>;
  onExecute?: () => void;
}

const isParamVisible = (param: Param, currentValues: Record<string, any>) => {
  if (!param.showIf) return true;
  const targetVal = currentValues[param.showIf.paramId];
  const targetArr = Array.isArray(targetVal) ? targetVal : [targetVal].filter(Boolean);
  
  if (param.showIf.includes && param.showIf.includes.length > 0) {
    if (!param.showIf.includes.some(v => targetArr.includes(v))) return false;
  }
  if (param.showIf.excludes && param.showIf.excludes.length > 0) {
    if (param.showIf.excludes.some(v => targetArr.includes(v))) return false;
  }
  return true;
};

const isParamOptional = (param: Param, currentValues: Record<string, any>) => {
  if (param.requiredIf) {
    const targetVal = currentValues[param.requiredIf.paramId];
    const targetArr = Array.isArray(targetVal) ? targetVal : [targetVal].filter(Boolean);
    
    if (param.requiredIf.includes && param.requiredIf.includes.length > 0) {
      if (param.requiredIf.includes.some(v => targetArr.includes(v))) return false;
    }
    if (param.requiredIf.excludes && param.requiredIf.excludes.length > 0) {
      if (param.requiredIf.excludes.some(v => targetArr.includes(v))) return false;
    }
  }
  return param.optional;
};

export default function ParamWizard({ tool, stepIndex = 0, values = {}, onExecute }: ParamWizardProps) {
  const { push, pop } = useNavigation();
  const [searchText, setSearchText] = useState("");
  const [options, setOptions] = useState<DynamicOption[]>([]);
  const [historyOptions, setHistoryOptions] = useState<DynamicOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [overridePath, setOverridePath] = useState<string | undefined>(undefined);
  const [isSelectingPath, setIsSelectingPath] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const params = tool.params || [];
  const currentParam = params[stepIndex];
  
  const checkIsLastStep = (currentVal: string) => {
    const tempValues = { ...values, [currentParam.id]: currentVal };
    let nextIndex = stepIndex + 1;
    while (nextIndex < params.length && !isParamVisible(params[nextIndex], tempValues)) {
      nextIndex++;
    }
    return nextIndex >= params.length;
  };

  useEffect(() => {
    const loadOptions = async () => {
      if (!currentParam) return;
      setIsLoading(true);
      setErrorMsg(null);
      setIsSelectingPath(false);
      
      try {
        // Load history
        const historyStr = await LocalStorage.getItem<string>(`param_history_${currentParam.id}`);
        let history: string[] = [];
        if (historyStr) {
          try {
            history = JSON.parse(historyStr);
            setHistoryOptions(history.map(h => ({ value: h, title: h })));
          } catch (e) {}
        }

        if (currentParam.options) {
          setOptions(currentParam.options);
        } else if (currentParam.dynamic) {
          const dynOptions = await getGitDynamicOptionsAsync(currentParam.dynamic, overridePath);
          setOptions(dynOptions);
        } else if (currentParam.values) {
          setOptions(currentParam.values.map(v => ({ value: v, title: v })));
        } else {
          setOptions([]);
        }
      } catch (e: any) {
        const msg = e.message || "获取参数选项失败";
        if (msg.includes("Git 仓库") || msg.includes("降级至用户主目录") || msg.includes("package.json") || msg.includes("无效的路径")) {
          setIsSelectingPath(true);
          // Load recent paths
          const pathsStr = await LocalStorage.getItem<string>("recent_repo_paths");
          if (pathsStr) {
            try { setRecentPaths(JSON.parse(pathsStr)); } catch (e) {}
          }
        } else {
          setErrorMsg(msg);
        }
        setOptions([]);
      }
      
      setIsLoading(false);
    };
    
    loadOptions();
  }, [currentParam, overridePath, refreshKey]);

  if (!currentParam) {
    return null;
  }

  const buildCommand = (finalValues: Record<string, string>) => {
    let cmd = tool.cmd;
    for (const param of params) {
      if (!isParamVisible(param, finalValues)) {
        cmd = cmd.replace(`{${param.id}}`, "");
        continue;
      }
      const val = finalValues[param.id] || "";
      cmd = cmd.replace(`{${param.id}}`, val);
    }
    return cmd.replace(/\s+/g, ' ').trim();
  };

  const getPreviewCommand = (currentInput: string) => {
    const tempValues = { ...values, [currentParam.id]: currentInput };
    let cmd = tool.cmd;
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (!isParamVisible(p, tempValues)) {
        cmd = cmd.replace(`{${p.id}}`, "");
        continue;
      }
      if (i < stepIndex) {
        cmd = cmd.replace(`{${p.id}}`, values[p.id] || "");
      } else if (i === stepIndex) {
        cmd = cmd.replace(`{${p.id}}`, currentInput || `{${p.id}}`);
      } else {
        cmd = cmd.replace(`{${p.id}}`, `{${p.id}}`);
      }
    }
    return cmd.replace(/\s+/g, ' ').trim();
  };

  const handleAction = async (val: string, actionType: 'copy' | 'paste' | 'pure-copy' | 'silent') => {
    const newValues = { ...values, [currentParam.id]: val };
    
    // Save to history
    if (val.trim()) {
      const historyStr = await LocalStorage.getItem<string>(`param_history_${currentParam.id}`);
      let history: string[] = [];
      if (historyStr) {
        try { history = JSON.parse(historyStr); } catch (e) {}
      }
      history = [val, ...history.filter(h => h !== val)].slice(0, 5); // Keep last 5
      await LocalStorage.setItem(`param_history_${currentParam.id}`, JSON.stringify(history));
    }
    
    let nextIndex = stepIndex + 1;
    while (nextIndex < params.length && !isParamVisible(params[nextIndex], newValues)) {
      nextIndex++;
    }
    const isTrulyLastStep = nextIndex >= params.length;
    
    if (isTrulyLastStep) {
      if (onExecute) onExecute();
      const { replaceGlobalEnvVars } = require("../utils");
      const { saveCommandHistory } = require("../history");
      const cmd = replaceGlobalEnvVars(buildCommand(newValues));
      await saveCommandHistory(cmd);
      
      if (actionType === 'silent') {
        const { SilentExecutionView } = require("./SilentExecutionView");
        push(<SilentExecutionView cmd={cmd} title={tool.title || "Silent Execution"} />);
        return;
      }
      
      if (actionType === 'copy') {
        await Clipboard.copy(cmd);
      } else if (actionType === 'paste') {
        await Clipboard.paste(cmd);
      } else if (actionType === 'pure-copy') {
        const { pureCopyCmd } = require("../utils");
        const { executeInGhostty } = require("../ghostty");
        const pureCmd = pureCopyCmd(cmd);
        const copyCmd = `${pureCmd} | tr -d '\\n' | pbcopy`;
        await executeInGhostty(copyCmd);
      }
      await closeMainWindow();
    } else {
      push(<ParamWizard tool={tool} stepIndex={nextIndex} values={newValues} onExecute={onExecute} />);
      setSearchText(""); // Reset search text for next step if they go back
    }
  };

  const filteredOptions = options.filter(opt => 
    opt.title.toLowerCase().includes(searchText.toLowerCase()) || 
    opt.value.toLowerCase().includes(searchText.toLowerCase())
  );

  const filteredHistory = historyOptions.filter(opt => 
    opt.title.toLowerCase().includes(searchText.toLowerCase()) || 
    opt.value.toLowerCase().includes(searchText.toLowerCase())
  ).filter(h => !filteredOptions.find(o => o.value === h.value)); // Don't show in history if it's already in options

  const showCustomInput = searchText.trim().length > 0;
  const exactMatch = options.find(opt => opt.value === searchText.trim()) || historyOptions.find(opt => opt.value === searchText.trim());

  const handleSelectPath = async (path: string) => {
    const newPaths = [path, ...recentPaths.filter(p => p !== path)].slice(0, 10);
    setRecentPaths(newPaths);
    await LocalStorage.setItem("recent_repo_paths", JSON.stringify(newPaths));
    setOverridePath(path);
    setSearchText("");
  };

  if (currentParam.type === "file" || currentParam.type === "directory" || (currentParam.type === "multiselect" && currentParam.dynamic === "file_path")) {
    return (
      <InteractiveFileBrowser 
        title={`Step ${stepIndex + 1}/${params.length}  ·  Select ${currentParam.id}`}
        allowMultiple={currentParam.type === "multiselect"}
        previewCommand={getPreviewCommand}
        onSelect={(paths) => {
          handleAction(paths.join(" "), 'copy');
        }}
      />
    );
  }

  const renderActions = (val: string, isLast: boolean, suffix = "") => {
    if (!isLast) {
      return <Action title={`Next Step${suffix}`} onAction={() => handleAction(val, 'copy')} />;
    }
    return (
      <>
        {tool.mode === "silent" ? (
          <Action title={`Execute Silently${suffix}`} onAction={() => handleAction(val, 'silent')} icon={Icon.Terminal} />
        ) : (
          <Action title={`Paste to Active App${suffix}`} onAction={() => handleAction(val, 'paste')} icon={Icon.Terminal} />
        )}
        <Action title={`Copy Command${suffix}`} onAction={() => handleAction(val, 'copy')} shortcut={tool.mode === "silent" ? { modifiers: ["cmd"], key: "c" } : undefined} icon={Icon.Clipboard} />
        {tool.mode !== "silent" && (
          <Action title={`Pure Output Copy${suffix}`} onAction={() => handleAction(val, 'pure-copy')} shortcut={{ modifiers: ["opt"], key: "enter" }} icon={Icon.Clipboard} />
        )}
      </>
    );
  };

  if (isSelectingPath) {
    const filteredRecentPaths = recentPaths.filter(p => p.toLowerCase().includes(searchText.toLowerCase()));
    const showCustomPath = searchText.trim().length > 0 && !recentPaths.includes(searchText.trim());

    return (
      <List
        isLoading={isLoading}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        searchBarPlaceholder="Enter project path (e.g. ~/Work/project)..."
        navigationTitle={`Select Project Path for ${currentParam.id}`}
      >
        <List.Item
          icon={Icon.ArrowClockwise}
          title="重新检测 (Retry Detection)"
          subtitle="重新读取当前前台应用的路径"
          actions={
            <ActionPanel>
              <Action title="Retry" onAction={() => setRefreshKey(k => k + 1)} icon={Icon.ArrowClockwise} />
            </ActionPanel>
          }
        />

        <List.EmptyView
          icon={Icon.Folder}
          title="未检测到有效的项目上下文"
          description="请在上方输入项目路径，或从历史记录中选择。"
        />

        {showCustomPath && (
          <List.Item
            icon={Icon.Folder}
            title={`Use custom path: "${searchText}"`}
            actions={
              <ActionPanel>
                <Action title="Select Path" onAction={() => handleSelectPath(searchText.trim())} />
              </ActionPanel>
            }
          />
        )}

        {recentPaths.length > 0 && (
          <List.Section title="Recent Paths">
            {filteredRecentPaths.map((p, idx) => (
              <List.Item
                key={`path-${idx}`}
                icon={Icon.Folder}
                title={p}
                actions={
                  <ActionPanel>
                    <Action title="Select Path" onAction={() => handleSelectPath(p)} />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        )}
      </List>
    );
  }

  const isOptional = isParamOptional(currentParam, values);

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={`Enter value for ${currentParam.id} (${currentParam.description || ''})...`}
      navigationTitle={`Step ${stepIndex + 1}/${params.length}  ·  ${getPreviewCommand(searchText)}`}
    >
      {errorMsg && (
        <List.EmptyView
          icon={{ source: Icon.Warning, tintColor: "red" }}
          title="获取选项失败"
          description={`${errorMsg}\n\nPreview: ${getPreviewCommand(searchText)}`}
          actions={
            <ActionPanel>
              {renderActions("", checkIsLastStep(""), " (Empty)")}
            </ActionPanel>
          }
        />
      )}

      {!errorMsg && isOptional && (
        <List.Section title="Optional">
          <List.Item
            icon={Icon.MinusCircle}
            title="-- 不指定 (Skip) --"
            subtitle={{ value: getPreviewCommand(""), tooltip: getPreviewCommand("") }}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Actions">
                  {renderActions("", checkIsLastStep(""))}
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {!errorMsg && showCustomInput && !exactMatch && (() => {
        const isLast = checkIsLastStep(searchText);
        return (
          <List.Item
            icon={Icon.Pencil}
            title={`Use custom value: "${searchText}"`}
            subtitle={getPreviewCommand(searchText)}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Actions">
                  {renderActions(searchText, isLast)}
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })()}
      
      {!errorMsg && filteredHistory.length > 0 && (
        <List.Section title="Recent History">
          {filteredHistory.map((opt, idx) => {
            const isLast = checkIsLastStep(opt.value);
            return (
              <List.Item
                key={`hist-${opt.value}-${idx}`}
                icon={Icon.Clock}
                title={{ value: opt.title, tooltip: opt.title }}
                subtitle={{ value: getPreviewCommand(opt.value), tooltip: getPreviewCommand(opt.value) }}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section title="Actions">
                      {renderActions(opt.value, isLast)}
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {!errorMsg && filteredOptions.length > 0 && (
        <List.Section title={currentParam.dynamic ? "Dynamic Options" : "Available Options"}>
          {filteredOptions.map((opt, idx) => {
            const isLast = checkIsLastStep(opt.value);
            return (
              <List.Item
                key={`${opt.value}-${idx}`}
                icon={Icon.Text}
                title={{ value: opt.title, tooltip: opt.title }}
                subtitle={{ value: getPreviewCommand(opt.value), tooltip: getPreviewCommand(opt.value) }}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section title="Actions">
                      {renderActions(opt.value, isLast)}
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
      
      {!errorMsg && !showCustomInput && options.length === 0 && historyOptions.length === 0 && !isLoading && (() => {
        const isLast = checkIsLastStep("");
        const isOptional = isParamOptional(currentParam, values);
        return (
          <List.EmptyView
            icon={Icon.Pencil}
            title={`Type to enter a value for ${currentParam.id}`}
            description={`Preview: ${getPreviewCommand(searchText)}\n\n${currentParam.examples ? `e.g. ${currentParam.examples.join(", ")}` : ""}`}
            actions={
              isOptional ? (
                <ActionPanel>
                  <ActionPanel.Section title="Actions">
                    {renderActions("", isLast, " (Empty)")}
                  </ActionPanel.Section>
                </ActionPanel>
              ) : undefined
            }
          />
        );
      })()}
    </List>
  );
}
