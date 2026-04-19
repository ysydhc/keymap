import { Detail, ActionPanel, Action, Icon } from "@raycast/api";

export function WebSearchResultView({ query, content }: { query: string; content: string }) {
  return (
    <Detail
      navigationTitle={`Web Search: ${query}`}
      markdown={content}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Result" content={content} />
        </ActionPanel>
      }
    />
  );
}
