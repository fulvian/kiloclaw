// kilocode_change new file
import { RGBA } from "@opentui/core"
import { For, type JSX } from "solid-js"
import { useTheme, tint } from "@tui/context/theme"

// Shadow markers (rendered chars in parens):
// _ = full shadow cell (space with bg=shadow)
// ^ = letter top, shadow bottom (▀ with fg=letter, bg=shadow)
// ~ = shadow top only (▀ with fg=shadow)
const SHADOW_MARKER = /[_^~]/

// Green gradient colors (dark to bright green)
const GREEN_COLORS = [
  "#164a16", // dark green
  "#1e5c1e", // darker green
  "#286e28", // dark-medium green
  "#328032", // medium green
  "#3c923c", // medium-bright green
  "#46a446", // bright green
  "#50b650", // very bright green
  "#5ac85a", // extremely bright green
]

const ASCII_LOGO = [
  `██ ██▄ ▄█▀ ██▀ █  █ █▀▀▀ █▀▀█ █▀▀▀ █▀▀█ █▀▀▀ █▀▀▀`,
  `██ █ █▄ █ ▄█▄ █▀▀█ █ ▀▄ █▄▄▀ █▀▀▀ █▄▄█ █▀▀▀ █▀▀▀`,
  `██ █ ▀▀ █▀ ▀█▀ ▀ ▀▀ ▀▀▀▀ ▀  ▀ ▀▀▀▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀`,
]

export function KiloLogo() {
  const { theme } = useTheme()

  const renderLine = (line: string, colorIndex: number): JSX.Element[] => {
    const green = RGBA.fromHex(GREEN_COLORS[colorIndex % GREEN_COLORS.length]!)
    const shadow = tint(theme.background, green, 0.4)
    const elements: JSX.Element[] = []
    let i = 0

    while (i < line.length) {
      const rest = line.slice(i)
      const markerIndex = rest.search(SHADOW_MARKER)

      if (markerIndex === -1) {
        elements.push(
          <text fg={green} selectable={false}>
            {rest}
          </text>,
        )
        break
      }

      if (markerIndex > 0) {
        elements.push(
          <text fg={green} selectable={false}>
            {rest.slice(0, markerIndex)}
          </text>,
        )
      }

      const marker = rest[markerIndex]
      switch (marker) {
        case "_":
          elements.push(
            <text fg={green} bg={shadow} selectable={false}>
              {" "}
            </text>,
          )
          break
        case "^":
          elements.push(
            <text fg={green} bg={shadow} selectable={false}>
              ▀
            </text>,
          )
          break
        case "~":
          elements.push(
            <text fg={shadow} selectable={false}>
              ▀
            </text>,
          )
          break
      }

      i += markerIndex + 1
    }

    return elements
  }

  return (
    <box>
      <For each={ASCII_LOGO}>{(line, index) => <box flexDirection="row">{renderLine(line, index())}</box>}</For>
    </box>
  )
}
