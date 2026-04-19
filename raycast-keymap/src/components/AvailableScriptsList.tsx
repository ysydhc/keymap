import { List, ActionPanel, Action, Icon } from "@raycast/api";
import { getCustomScripts } from "../utils";

export function AvailableScriptsList() {
  const customScripts = getCustomScripts();
  const builtInScripts = [
    "git_branches", "git_changed_files", "git_remotes", "git_stashes", "git_tags", "git_commits",
    "file_path", "docker_containers", "docker_containers_all", "docker_images", "docker_volumes",
    "docker_networks", "docker_contexts", "npm_scripts", "npm_dependencies", "npm_workspaces",
    "npm_bins", "docker_compose_services", "k8s_namespaces", "k8s_pods", "active_ports",
    "top_processes", "ssh_hosts", "adb_devices", "apk_files"
  ];

  return (
    <List searchBarPlaceholder="Search available scripts...">
      {customScripts.length > 0 && (
        <List.Section title="📝 自定义脚本 (Custom Scripts)">
          {customScripts.map(s => (
            <List.Item
              key={s.name}
              title={s.name}
              icon={Icon.Code}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title="Copy Script Name" content={s.name} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      <List.Section title="🔒 内置脚本 (Built-in Scripts)">
        {builtInScripts.map(s => (
          <List.Item
            key={s}
            title={s}
            icon={Icon.Lock}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Script Name" content={s} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
