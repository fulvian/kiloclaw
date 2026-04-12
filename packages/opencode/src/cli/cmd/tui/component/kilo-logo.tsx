// kilocode_change new file
import { RGBA } from "@opentui/core"
import { For, type JSX } from "solid-js"
import { useTheme, tint } from "@tui/context/theme"

// Block letter pixel art spelling KILOCLAW - 5x5 grid per letter
const ASCII_LOGO = [
  "█  █   █   █      ██   ██  █      ██  █  █ ",
  "█ █    █   █    █  █ █    █     █  █ █  █ ",
  "██     █   █    █  █ █    █     █████ █  █ ",
  "█ █    █   █    █  █ █    █     █  █ █  █ ",
  "█  █   █   █████  ██   ██  █████ █  █ █ ██ ",
]

// Single color for simplicity and maximum readability
const LOGO_COLOR = "#5ac85a" // bright green

export function KiloLogo() {
  const { theme } = useTheme()
  const color = RGBA.fromHex(LOGO_COLOR)

  return (
    <box>
      <For each={ASCII_LOGO}>
        {(line) => (
          <box flexDirection="row">
            <text fg={color} selectable={false}>
              {line}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
