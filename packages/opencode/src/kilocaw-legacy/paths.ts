import * as path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

export namespace KiloclawPaths {
  const home = () => process.env.HOME || process.env.USERPROFILE || os.homedir()

  /**
   * Get the platform-specific VSCode global storage path for Kiloclaw extension.
   * - macOS: ~/Library/Application Support/Code/User/globalStorage/kiloclaw.kilo-code
   * - Windows: %APPDATA%/Code/User/globalStorage/kiloclaw.kilo-code
   * - Linux: ~/.config/Code/User/globalStorage/kiloclaw.kilo-code
   */
  export function vscodeGlobalStorage(): string {
    const home = os.homedir()
    switch (process.platform) {
      case "darwin":
        return path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "kiloclaw.kilo-code")
      case "win32":
        return path.join(
          process.env.APPDATA || path.join(home, "AppData", "Roaming"),
          "Code",
          "User",
          "globalStorage",
          "kiloclaw.kilo-code",
        )
      default:
        return path.join(home, ".config", "Code", "User", "globalStorage", "kiloclaw.kilo-code")
    }
  }

  /** Global Kiloclaw directories in user home: ~/.kiloclaw only (fully isolated from KiloCode - LEGACY) */
  export function globalDirs(): string[] {
    return [path.join(home(), ".kiloclaw")]
  }

  /**
   * Discover Kiloclaw directories containing skills.
   * Returns parent directories (.kiloclaw/) for glob pattern "skills/[*]/SKILL.md".
   *
   * - Walks up from projectDir to worktreeRoot for .kiloclaw/
   * - Includes global ~/.kiloclaw/
   * - Includes VSCode extension global storage
   *
   * Fully isolated from KiloCode - LEGACY - does NOT read .kilocode/ or .kilo/ directories.
   *
   * Does NOT copy/migrate skills - just provides paths for discovery.
   * Skills remain in their original locations and can be managed independently
   * by the Kiloclaw VSCode extension.
   */
  export async function skillDirectories(opts: {
    projectDir: string
    worktreeRoot: string
    skipGlobalPaths?: boolean
  }): Promise<string[]> {
    const directories: string[] = []

    if (!opts.skipGlobalPaths) {
      // 1. Global ~/.kilocaw/ (loaded first so project-level overrides)
      for (const global of globalDirs()) {
        const globalSkills = path.join(global, "skills")
        if (!(await Filesystem.isDir(globalSkills))) continue
        directories.push(global) // Return parent, not skills/
      }

      // 2. VSCode extension global storage (marketplace-installed skills)
      const vscode = vscodeGlobalStorage()
      const vscodeSkills = path.join(vscode, "skills")
      if (await Filesystem.isDir(vscodeSkills)) {
        directories.push(vscode) // Return parent, not skills/
      }
    }

    // 3. Walk up from project dir to worktree root for .kiloclaw/
    // Returns parent directories (not skills/) because
    // the glob pattern "skills/[*]/SKILL.md" is applied from the parent
    // Loaded last so project-level skills take precedence over global
    for (const target of [".kiloclaw"] as const) {
      const projectDirs = await Array.fromAsync(
        Filesystem.up({
          targets: [target],
          start: opts.projectDir,
          stop: opts.worktreeRoot,
        }),
      )
      for (const dir of projectDirs) {
        const skillsDir = path.join(dir, "skills")
        if ((await Filesystem.isDir(skillsDir)) && !directories.includes(dir)) {
          directories.push(dir)
        }
      }
    }

    return directories
  }
}
