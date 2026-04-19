import { Form, ActionPanel, Action, useNavigation, Clipboard, closeMainWindow, LocalStorage, Icon, List, showToast, Toast } from "@raycast/api";
import { useState, useEffect, useMemo, Fragment } from "react";
import { Tool, Param } from "../types";
import { pureCopyCmd, getGitDynamicOptionsAsync, DynamicOption } from "../utils";
import { executeInGhostty } from "../ghostty";

interface WizardProps {
  tool: Tool;
  onExecute?: () => void;
}

export default function Wizard({ tool, onExecute }: WizardProps) {
  const { push, pop } = useNavigation();
  const [values, setValues] = useState<Record<string, any>>({});
  const [useCustom, setUseCustom] = useState<Record<string, boolean>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, DynamicOption[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [overridePath, setOverridePath] = useState<string | undefined>(undefined);
  const [isSelectingPath, setIsSelectingPath] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const params = tool.params || [];

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

  useEffect(() => {
    // Load dynamic options
    const loadDynamics = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      setIsSelectingPath(false);
      const newDynamicOptions: Record<string, DynamicOption[]> = {};
      const initialValues: Record<string, any> = {};
      
      let hasPathError = false;
      let lastErrorMsg = "";

      for (const param of params) {
        try {
          if (param.type === "flags" || param.type === "multiselect") {
            initialValues[param.id] = [];
          } else if (param.type === "file" || param.type === "directory") {
            initialValues[param.id] = [];
          } else if (param.dynamic) {
            const options = await getGitDynamicOptionsAsync(param.dynamic, overridePath);
            if (options.length > 0) {
              newDynamicOptions[param.id] = options;
              initialValues[param.id] = param.optional ? "" : options[0].value;
            } else {
              initialValues[param.id] = "";
            }
          } else if (param.options && param.options.length > 0) {
            initialValues[param.id] = param.optional ? "" : param.options[0].value;
          } else if (param.values && param.values.length > 0) {
            initialValues[param.id] = param.optional ? "" : param.values[0];
          } else {
            initialValues[param.id] = "";
          }
        } catch (e: any) {
          const msg = e.message || "获取部分参数选项失败";
          lastErrorMsg = msg;
          if (msg.includes("Git 仓库") || msg.includes("降级至用户主目录") || msg.includes("package.json") || msg.includes("无效的路径")) {
            hasPathError = true;
          }
        }
      }
      
      if (hasPathError) {
        setIsSelectingPath(true);
        const pathsStr = await LocalStorage.getItem<string>("recent_repo_paths");
        if (pathsStr) {
          try { setRecentPaths(JSON.parse(pathsStr)); } catch (e) {}
        }
      } else if (lastErrorMsg) {
        setErrorMsg(lastErrorMsg);
      }
      
      setDynamicOptions(newDynamicOptions);
      setValues(initialValues);
      setIsLoading(false);
      setInitialLoaded(true);
    };
    
    loadDynamics();
  }, [params, overridePath, refreshKey]);

  const autoFocusId = useMemo(() => {
    if (!initialLoaded) return null;
    for (const param of params) {
      if (!isParamVisible(param, values)) continue;
      
      const hasDynamic = dynamicOptions[param.id] && dynamicOptions[param.id].length > 0;
      const hasStatic = param.values && param.values.length > 0;
      const hasOptions = param.options && param.options.length > 0;
      
      // If it's a dropdown with exactly 1 option (and not in custom mode), skip focusing it
      if (hasDynamic && dynamicOptions[param.id].length === 1 && !useCustom[param.id]) {
        continue;
      }
      if (hasStatic && param.values!.length === 1 && !useCustom[param.id]) {
        continue;
      }
      if (hasOptions && param.options!.length === 1 && !useCustom[param.id]) {
        continue;
      }
      
      // Return the first parameter that doesn't meet the "skip" criteria
      return param.id;
    }
    // Fallback to the first parameter if all were skipped (or if none exist)
    return params.find(p => isParamVisible(p, values))?.id;
  }, [params, dynamicOptions, useCustom, initialLoaded, values]);

  const buildCommand = (formValues: Record<string, any>) => {
    let cmd = tool.cmd;
    for (const param of params) {
      if (!isParamVisible(param, formValues)) {
        cmd = cmd.replace(`{${param.id}}`, "");
        continue;
      }
      let val = formValues[param.id];
      if (Array.isArray(val)) {
        val = val.join(" ");
      }
      cmd = cmd.replace(`{${param.id}}`, val || "");
    }
    return cmd.replace(/\s+/g, ' ').trim();
  };

  const handleAction = async (rawFormValues: Record<string, any>, actionType: 'copy' | 'paste' | 'pure-copy' | 'silent') => {
    // Normalize form values because dropdowns use drop_${param.id}
    const formValues = { ...rawFormValues };
    for (const param of params) {
      if (rawFormValues[`drop_${param.id}`] !== undefined && rawFormValues[`drop_${param.id}`] !== "__CUSTOM__") {
        formValues[param.id] = rawFormValues[`drop_${param.id}`];
      }
    }

    // Validate required visible params
    for (const param of params) {
      if (isParamVisible(param, formValues) && !isParamOptional(param, formValues)) {
        const val = formValues[param.id];
        if (!val || (Array.isArray(val) && val.length === 0)) {
          await showToast({ style: Toast.Style.Failure, title: `参数缺失`, message: `${param.description || param.id} 是必填项` });
          return;
        }
      }
    }

    if (onExecute) onExecute();
    
    // Save custom values to history
    for (const param of params) {
      if (!isParamVisible(param, formValues)) continue;
      const val = formValues[param.id];
      if (val && typeof val === 'string' && val.trim()) {
        const historyStr = await LocalStorage.getItem<string>(`param_history_${param.id}`);
        let history: string[] = [];
        if (historyStr) {
          try { history = JSON.parse(historyStr); } catch (e) {}
        }
        history = [val, ...history.filter(h => h !== val)].slice(0, 5);
        await LocalStorage.setItem(`param_history_${param.id}`, JSON.stringify(history));
      }
    }

    const { replaceGlobalEnvVars } = require("../utils");
    const { saveCommandHistory } = require("../history");
    const cmd = replaceGlobalEnvVars(buildCommand(formValues));
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
      const pureCmd = pureCopyCmd(cmd);
      const copyCmd = `${pureCmd} | tr -d '\\n' | pbcopy`;
      await executeInGhostty(copyCmd);
    }
    
    await closeMainWindow();
    pop();
  };

  const currentPreview = buildCommand(values);

  const handleSelectPath = async (path: string) => {
    const newPaths = [path, ...recentPaths.filter(p => p !== path)].slice(0, 10);
    setRecentPaths(newPaths);
    await LocalStorage.setItem("recent_repo_paths", JSON.stringify(newPaths));
    setOverridePath(path);
    setSearchText("");
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
        navigationTitle={`Select Project Path for ${tool.title}`}
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

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          {tool.mode === "silent" ? (
            <Action.SubmitForm title="Execute Silently" icon={Icon.Terminal} onSubmit={(v) => handleAction(v, 'silent')} />
          ) : (
            <Action.SubmitForm title="Paste to Active App" icon={Icon.Terminal} onSubmit={(v) => handleAction(v, 'paste')} />
          )}
          <Action.SubmitForm title="Copy Command" icon={Icon.Clipboard} onSubmit={(v) => handleAction(v, 'copy')} shortcut={tool.mode === "silent" ? { modifiers: ["cmd"], key: "c" } : { modifiers: ["cmd"], key: "enter" }} />
          {tool.mode !== "silent" && (
            <Action.SubmitForm title="Pure Output Copy" icon={Icon.Clipboard} onSubmit={(v) => handleAction(v, 'pure-copy')} shortcut={{ modifiers: ["opt"], key: "enter" }} />
          )}
        </ActionPanel>
      }
    >
      <Form.Description text={`Original: ${tool.cmd}\nPreview:  ${currentPreview}`} />
      {errorMsg && <Form.Description text={`⚠️ ${errorMsg}`} />}
      <Form.Separator />
      
      {!initialLoaded ? (
        <Form.Description text="Loading parameters..." />
      ) : (
        <>
          {params.map((param) => {
            if (!isParamVisible(param, values)) return null;
            const isOptional = isParamOptional(param, values);

            if (param.type === "flags" || param.type === "multiselect") {
              const hasDynamic = dynamicOptions[param.id] && dynamicOptions[param.id].length > 0;
              return (
                <Form.TagPicker
                  key={`tag_${param.id}`}
                  id={param.id}
                  title={param.description || param.id}
                  value={(values[param.id] as any as string[]) || []}
                  onChange={(val) => setValues({ ...values, [param.id]: val })}
                >
                  {hasDynamic ? (
                    dynamicOptions[param.id].map((opt) => (
                      <Form.TagPicker.Item key={opt.value} value={opt.value} title={opt.title} />
                    ))
                  ) : (
                    param.options?.map((opt) => (
                      <Form.TagPicker.Item key={opt.value} value={opt.value} title={opt.title} />
                    ))
                  )}
                </Form.TagPicker>
              );
            }

            if (param.type === "file" || param.type === "directory") {
              return (
                <Form.FilePicker
                  key={`file_${param.id}`}
                  id={param.id}
                  title={param.description || param.id}
                  allowMultipleSelection={true}
                  canChooseDirectories={param.type === "directory"}
                  canChooseFiles={param.type === "file"}
                  value={(values[param.id] as any as string[]) || []}
                  onChange={(val) => setValues({ ...values, [param.id]: val })}
                />
              );
            }

            const hasDynamic = dynamicOptions[param.id] && dynamicOptions[param.id].length > 0;
            const hasStatic = param.values && param.values.length > 0;
            const hasOptions = param.options && param.options.length > 0;
            const isCustom = useCustom[param.id] || false;
            const isAutoFocus = param.id === autoFocusId;

            if (hasDynamic || hasStatic || hasOptions) {
              return (
                <Fragment key={`frag_${param.id}`}>
                  <Form.Dropdown
                    id={`drop_${param.id}`}
                    autoFocus={isAutoFocus && !isCustom}
                    title={param.description || param.id}
                    value={isCustom ? "__CUSTOM__" : (values[param.id] as string || "")}
                    onChange={(val) => {
                      if (val === "__CUSTOM__") {
                        setUseCustom({ ...useCustom, [param.id]: true });
                        setValues({ ...values, [param.id]: "" });
                      } else {
                        setUseCustom({ ...useCustom, [param.id]: false });
                        setValues({ ...values, [param.id]: val });
                      }
                    }}
                  >
                    <Form.Dropdown.Item key="__CUSTOM__" value="__CUSTOM__" title="✏️ 手动输入自定义值 (Manual Input)" />
                    {isOptional && (
                      <Form.Dropdown.Item key="__EMPTY__" value="" title="-- 不指定 (None) --" />
                    )}
                    {hasOptions && param.options!.map((opt) => (
                      <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
                    ))}
                    {!hasOptions && hasDynamic && dynamicOptions[param.id].map((opt) => (
                      <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
                    ))}
                    {!hasOptions && hasStatic && param.values!.map((v) => (
                      <Form.Dropdown.Item key={v} value={v} title={v} />
                    ))}
                  </Form.Dropdown>

                  {/* 如果选中的是长文本，在下方显示完整内容 */}
                  {!isCustom && values[param.id] && (() => {
                    const selectedVal = values[param.id] as string;
                    let fullTitle = "";
                    if (hasOptions) fullTitle = param.options!.find(o => o.value === selectedVal)?.title || "";
                    else if (hasDynamic) fullTitle = dynamicOptions[param.id].find(o => o.value === selectedVal)?.title || "";
                    else if (hasStatic) fullTitle = param.values!.find(v => v === selectedVal) || "";
                    
                    if (fullTitle && fullTitle.length > 25) {
                      return <Form.Description text={`📄 ${fullTitle}`} />;
                    }
                    return null;
                  })()}

                  {isCustom && (
                    <Form.TextField
                      id={param.id}
                      autoFocus={isAutoFocus && isCustom}
                      title={`${param.description || param.id} (Custom)`}
                      value={values[param.id] as string || ""}
                      onChange={(val) => setValues({ ...values, [param.id]: val })}
                      placeholder="Enter custom value..."
                    />
                  )}
                </Fragment>
              );
            }
            
            return (
              <Form.TextField
                key={`text_${param.id}`}
                id={param.id}
                autoFocus={isAutoFocus}
                title={param.description || param.id}
                value={values[param.id] as string || ""}
                placeholder={param.examples ? `e.g. ${param.examples.join(", ")}` : ""}
                onChange={(val) => setValues({ ...values, [param.id]: val })}
              />
            );
          })}
        </>
      )}
    </Form>
  );
}