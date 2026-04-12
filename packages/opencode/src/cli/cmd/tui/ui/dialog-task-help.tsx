import { TextAttributes } from "@opentui/core"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"

export function DialogTaskHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "escape") {
      dialog.clear()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexGrow={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Task Commands
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1} flexDirection="column" gap={0}>
        <text fg={theme.textMuted}>Manage scheduled tasks from the terminal.</text>
      </box>
      <box flexDirection="column" gap={0} paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          Usage
        </text>
        <text fg={theme.text}> /tasks Open task list</text>
        <text fg={theme.text}> /tasks list List all tasks</text>
        <text fg={theme.text}> /tasks new Create new task (wizard)</text>
        <text fg={theme.textMuted}> /tasks show &lt;selector&gt; Show task details</text>
        <text fg={theme.textMuted}> /tasks edit &lt;selector&gt; Edit task</text>
        <text fg={theme.text}> /tasks runs &lt;selector&gt; Show task run history</text>
        <text fg={theme.text}> /tasks dlq Show dead letter queue</text>
        <text fg={theme.text}> /tasks pause &lt;selector&gt; Pause task</text>
        <text fg={theme.text}> /tasks resume &lt;selector&gt; Resume task</text>
        <text fg={theme.text}> /tasks run &lt;selector&gt; Run task immediately</text>
        <text fg={theme.text}> /tasks delete &lt;selector&gt; Delete task (with confirmation)</text>
      </box>
      <box flexDirection="column" gap={0} paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          Selector
        </text>
        <text fg={theme.textMuted}> Allowed forms: task ref, full id, #index in list, exact task name</text>
        <text fg={theme.textMuted}> Names with spaces are supported directly or quoted</text>
        <text fg={theme.textMuted}> Example: /tasks show weekly report check</text>
        <text fg={theme.textMuted}> Example: /tasks show "weekly report check"</text>
      </box>
      <box flexDirection="column" gap={0} paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          Quick Actions
        </text>
        <text fg={theme.textMuted}> From task list: click a task to open detail</text>
        <text fg={theme.textMuted}> From detail: Edit button opens wizard</text>
        <text fg={theme.textMuted}> From detail: Pause/Resume/Run now buttons</text>
        <text fg={theme.textMuted}> Delete is available in detail footer</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingTop={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}
