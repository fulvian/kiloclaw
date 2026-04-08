import { TextAttributes } from "@opentui/core"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "@tui/context/keybind"

export function DialogTaskHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const keybind = useKeybind()

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
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks"}</text>
          {"          Open task list"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks new"}</text>
          {"         Create new task (wizard)"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks new --advanced"}</text>
          {"   Create with full options"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks show <id>"}</text>
          {"    Show task details"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks edit <id>"}</text>
          {"     Edit task"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks list"}</text>
          {"          List all tasks"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks runs <id>"}</text>
          {"     Show task run history"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks dlq"}</text>
          {"           Show dead letter queue"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks pause <id>"}</text>
          {"    Pause task"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks resume <id>"}</text>
          {"   Resume task"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks run <id>"}</text>
          {"       Run task now"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks delete <id>"}</text>
          {"    Delete task"}
        </text>
        <text fg={theme.text}>
          <text fg={theme.primary}>{"  /tasks replay <dlq>"}</text>
          {"   Replay failed run"}
        </text>
      </box>
      <box flexDirection="column" gap={0} paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          Examples
        </text>
        <text fg={theme.textMuted}>{"  /tasks new --preset daily-09:00"}</text>
        <text fg={theme.textMuted}>{"  /tasks show task_01HZYF4S8M0V6Y6Q7C2N2J9R5A"}</text>
        <text fg={theme.textMuted}>{"  /tasks runs task_01HZYF4S8M0V6Y6Q7C2N2J9R5A --failed"}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingTop={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}
