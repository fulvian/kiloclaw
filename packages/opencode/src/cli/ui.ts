import z from "zod"
import { EOL } from "os"
import { NamedError } from "@opencode-ai/util/error"
import { logo as glyphs } from "./logo"

export namespace UI {
  export const CancelledError = NamedError.create("UICancelledError", z.void())

  export const Style = {
    TEXT_HIGHLIGHT: "\x1b[96m",
    TEXT_HIGHLIGHT_BOLD: "\x1b[96m\x1b[1m",
    TEXT_DIM: "\x1b[90m",
    TEXT_DIM_BOLD: "\x1b[90m\x1b[1m",
    TEXT_NORMAL: "\x1b[0m",
    TEXT_NORMAL_BOLD: "\x1b[1m",
    TEXT_WARNING: "\x1b[93m",
    TEXT_WARNING_BOLD: "\x1b[93m\x1b[1m",
    TEXT_DANGER: "\x1b[91m",
    TEXT_DANGER_BOLD: "\x1b[91m\x1b[1m",
    TEXT_SUCCESS: "\x1b[92m",
    TEXT_SUCCESS_BOLD: "\x1b[92m\x1b[1m",
    TEXT_INFO: "\x1b[94m",
    TEXT_INFO_BOLD: "\x1b[94m\x1b[1m",
  }

  export function println(...message: string[]) {
    print(...message)
    process.stderr.write(EOL)
  }

  export function print(...message: string[]) {
    blank = false
    process.stderr.write(message.join(" "))
  }

  let blank = false
  export function empty() {
    if (blank) return
    println("" + Style.TEXT_NORMAL)
    blank = true
  }

  // kilocode_change start
  export function logo(pad?: string) {
    const result: string[] = []
    const reset = "\x1b[0m"
    // Green gradient colors (dark to bright)
    const greenColors = [
      { fg: "\x1b[38;5;22m", shadow: "\x1b[38;5;28m", bg: "\x1b[48;5;22m" }, // dark green
      { fg: "\x1b[38;5;28m", shadow: "\x1b[38;5;34m", bg: "\x1b[48;5;28m" }, // darker green
      { fg: "\x1b[38;5;34m", shadow: "\x1b[38;5;40m", bg: "\x1b[48;5;34m" }, // dark-medium green
      { fg: "\x1b[38;5;40m", shadow: "\x1b[38;5;46m", bg: "\x1b[48;5;40m" }, // medium green
      { fg: "\x1b[38;5;46m", shadow: "\x1b[38;5;82m", bg: "\x1b[48;5;46m" }, // medium-bright green
      { fg: "\x1b[38;5;82m", shadow: "\x1b[38;5;118m", bg: "\x1b[48;5;82m" }, // bright green
      { fg: "\x1b[38;5;118m", shadow: "\x1b[38;5;154m", bg: "\x1b[48;5;118m" }, // very bright green
      { fg: "\x1b[38;5;154m", shadow: "\x1b[38;5;190m", bg: "\x1b[48;5;154m" }, // extremely bright green
    ]
    const gap = " "
    const draw = (line: string, colorIdx: number) => {
      const color = greenColors[colorIdx % greenColors.length]!
      const { fg, shadow, bg } = color
      const parts: string[] = []
      for (const char of line) {
        if (char === "_") {
          parts.push(bg, " ", reset)
          continue
        }
        if (char === "^") {
          parts.push(fg, bg, "▀", reset)
          continue
        }
        if (char === "~") {
          parts.push(shadow, "▀", reset)
          continue
        }
        if (char === " ") {
          parts.push(" ")
          continue
        }
        parts.push(fg, char, reset)
      }
      return parts.join("")
    }
    const totalRows = Math.max(glyphs.left.length, glyphs.right.length)
    for (let i = 0; i < totalRows; i++) {
      if (pad) result.push(pad)
      const leftRow = glyphs.left[i] ?? ""
      const rightRow = glyphs.right[i] ?? ""
      // Calculate gradient position based on row
      const leftColorIdx = Math.floor((i / totalRows) * greenColors.length)
      const rightColorIdx = Math.floor(((i + 1) / totalRows) * greenColors.length)
      result.push(draw(leftRow, leftColorIdx))
      result.push(gap)
      result.push(draw(rightRow, rightColorIdx))
      result.push(EOL)
    }
    return result.join("").trimEnd()
  }
  // kilocode_change end

  export async function input(prompt: string): Promise<string> {
    const readline = require("readline")
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(prompt, (answer: string) => {
        rl.close()
        resolve(answer.trim())
      })
    })
  }

  export function error(message: string) {
    if (message.startsWith("Error: ")) {
      message = message.slice("Error: ".length)
    }
    println(Style.TEXT_DANGER_BOLD + "Error: " + Style.TEXT_NORMAL + message)
  }

  export function markdown(text: string): string {
    return text
  }
}
