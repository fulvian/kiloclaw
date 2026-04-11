import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Clipboard } from "@tui/util/clipboard"
import { Selection } from "@tui/util/selection"
import { MouseButton, TextAttributes } from "@opentui/core"
import { RouteProvider, useRoute } from "@tui/context/route"
import { Switch, Match, createEffect, untrack, ErrorBoundary, createSignal, onMount, batch, Show, on } from "solid-js"
import { win32DisableProcessedInput, win32FlushInputBuffer, win32InstallCtrlCGuard } from "./win32"
import { Installation } from "@/installation"
import { Flag } from "@/flag/flag"
import { ProactiveTaskStore } from "@/kiloclaw/proactive/scheduler.store"
import { SchedulerControlService } from "@/kiloclaw/proactive/scheduler-control.service"
import { DialogProvider, useDialog } from "@tui/ui/dialog"
import { DialogProvider as DialogProviderList } from "@tui/component/dialog-provider"
import { SDKProvider, useSDK } from "@tui/context/sdk"
import { SyncProvider, useSync } from "@tui/context/sync"
import { LocalProvider, useLocal } from "@tui/context/local"
import { DialogModel, useConnected } from "@tui/component/dialog-model"
import { DialogMcp } from "@tui/component/dialog-mcp"
import { DialogStatus } from "@tui/component/dialog-status"
import { DialogThemeList } from "@tui/component/dialog-theme-list"
import { DialogHelp } from "./ui/dialog-help"
import { DialogTaskWizard } from "./ui/dialog-task-wizard"
import { DialogTaskList } from "./ui/dialog-task-list"
import { DialogTaskDetail } from "./ui/dialog-task-detail"
import { DialogTaskRuns } from "./ui/dialog-task-runs"
import { DialogTaskDLQ } from "./ui/dialog-task-dlq"
import { CommandProvider, useCommandDialog } from "@tui/component/dialog-command"
import { DialogAgent } from "@tui/component/dialog-agent"
import { DialogSessionList } from "@tui/component/dialog-session-list"
import { DialogWorkspaceList } from "@tui/component/dialog-workspace-list"
import { KeybindProvider } from "@tui/context/keybind"
import { ThemeProvider, useTheme } from "@tui/context/theme"
import { Home } from "@tui/routes/home"
import { Session } from "@tui/routes/session"
import { PromptHistoryProvider } from "./component/prompt/history"
import { FrecencyProvider } from "./component/prompt/frecency"
import { PromptStashProvider } from "./component/prompt/stash"
import { DialogAlert } from "./ui/dialog-alert"
import { isKiloError, showKiloErrorToast } from "@/kilocaw-legacy/kilo-errors" // kilocode_change
import { ToastProvider, useToast } from "./ui/toast"
import { ExitProvider, useExit } from "./context/exit"
import { Session as SessionApi } from "@/session"
import { DialogSelect } from "./ui/dialog-select"
import { Link } from "./ui/link"
import { TuiEvent } from "./event"
import { KVProvider, useKV } from "./context/kv"
import { Provider } from "@/provider/provider"
import { ArgsProvider, useArgs, type Args } from "./context/args"
import open from "open"
import { writeHeapSnapshot } from "v8"
import { PromptRefProvider, usePromptRef } from "./context/prompt"
import { registerKiloCommands } from "@/kilocaw-legacy/kilo-commands" // kilocode_change
import { initializeTUIDependencies } from "@kilocode/kilo-gateway/tui" // kilocode_change
import { TuiConfigProvider } from "./context/tui-config"
import { TuiConfig } from "@/config/tui"
import { requestSessionFeedback } from "./routes/session/feedback-bar" // kilocode_change
import { setTaskCommandHandlers } from "./task-command-router"
import { DialogTaskHelp } from "./ui/dialog-task-help"

async function getTerminalBackgroundColor(): Promise<"dark" | "light"> {
  // can't set raw mode if not a TTY
  if (!process.stdin.isTTY) return "dark"

  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.removeListener("data", handler)
      clearTimeout(timeout)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      const match = str.match(/\x1b]11;([^\x07\x1b]+)/)
      if (match) {
        cleanup()
        const color = match[1]
        // Parse RGB values from color string
        // Formats: rgb:RR/GG/BB or #RRGGBB or rgb(R,G,B)
        let r = 0,
          g = 0,
          b = 0

        if (color.startsWith("rgb:")) {
          const parts = color.substring(4).split("/")
          r = parseInt(parts[0], 16) >> 8 // Convert 16-bit to 8-bit
          g = parseInt(parts[1], 16) >> 8 // Convert 16-bit to 8-bit
          b = parseInt(parts[2], 16) >> 8 // Convert 16-bit to 8-bit
        } else if (color.startsWith("#")) {
          r = parseInt(color.substring(1, 3), 16)
          g = parseInt(color.substring(3, 5), 16)
          b = parseInt(color.substring(5, 7), 16)
        } else if (color.startsWith("rgb(")) {
          const parts = color.substring(4, color.length - 1).split(",")
          r = parseInt(parts[0])
          g = parseInt(parts[1])
          b = parseInt(parts[2])
        }

        // Calculate luminance using relative luminance formula
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        // Determine if dark or light based on luminance threshold
        resolve(luminance > 0.5 ? "light" : "dark")
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.on("data", handler)
    process.stdout.write("\x1b]11;?\x07")

    timeout = setTimeout(() => {
      cleanup()
      resolve("dark")
    }, 1000)
  })
}

import type { EventSource } from "./context/sdk"

export function tui(input: {
  url: string
  args: Args
  config: TuiConfig.Info
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
}) {
  // promise to prevent immediate exit
  return new Promise<void>(async (resolve) => {
    const unguard = win32InstallCtrlCGuard()
    win32DisableProcessedInput()

    const mode = await getTerminalBackgroundColor()

    // Re-clear after getTerminalBackgroundColor() — setRawMode(false) restores
    // the original console mode which re-enables ENABLE_PROCESSED_INPUT.
    win32DisableProcessedInput()

    const onExit = async () => {
      unguard?.()
      resolve()
    }

    render(
      () => {
        return (
          <ErrorBoundary
            fallback={(error, reset) => <ErrorComponent error={error} reset={reset} onExit={onExit} mode={mode} />}
          >
            <ArgsProvider {...input.args}>
              <ExitProvider onExit={onExit}>
                <KVProvider>
                  <ToastProvider>
                    <RouteProvider>
                      <TuiConfigProvider config={input.config}>
                        <SDKProvider
                          url={input.url}
                          directory={input.directory}
                          fetch={input.fetch}
                          headers={input.headers}
                          events={input.events}
                        >
                          <SyncProvider>
                            <ThemeProvider mode={mode}>
                              <LocalProvider>
                                <KeybindProvider>
                                  <PromptStashProvider>
                                    <DialogProvider>
                                      <CommandProvider>
                                        <FrecencyProvider>
                                          <PromptHistoryProvider>
                                            <PromptRefProvider>
                                              <App />
                                            </PromptRefProvider>
                                          </PromptHistoryProvider>
                                        </FrecencyProvider>
                                      </CommandProvider>
                                    </DialogProvider>
                                  </PromptStashProvider>
                                </KeybindProvider>
                              </LocalProvider>
                            </ThemeProvider>
                          </SyncProvider>
                        </SDKProvider>
                      </TuiConfigProvider>
                    </RouteProvider>
                  </ToastProvider>
                </KVProvider>
              </ExitProvider>
            </ArgsProvider>
          </ErrorBoundary>
        )
      },
      {
        targetFps: 60,
        gatherStats: false,
        exitOnCtrlC: false,
        useKittyKeyboard: {},
        autoFocus: false,
        openConsoleOnError: false,
        consoleOptions: {
          keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
          onCopySelection: (text) => {
            Clipboard.copy(text).catch((error) => {
              console.error(`Failed to copy console selection to clipboard: ${error}`)
            })
          },
        },
      },
    )
  })
}

function App() {
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  renderer.disableStdoutInterception()
  const dialog = useDialog()
  const local = useLocal()
  const kv = useKV()
  const command = useCommandDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme, mode, setMode } = useTheme()
  const sync = useSync()
  const exit = useExit()
  const promptRef = usePromptRef()

  useKeyboard((evt) => {
    if (!Flag.KILO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
    if (!renderer.getSelection()) return

    // Windows Terminal-like behavior:
    // - Ctrl+C copies and dismisses selection
    // - Esc dismisses selection
    // - Most other key input dismisses selection and is passed through
    if (evt.ctrl && evt.name === "c") {
      if (!Selection.copy(renderer, toast)) {
        renderer.clearSelection()
        return
      }

      evt.preventDefault()
      evt.stopPropagation()
      return
    }

    if (evt.name === "escape") {
      renderer.clearSelection()
      evt.preventDefault()
      evt.stopPropagation()
      return
    }

    renderer.clearSelection()
  })

  // Wire up console copy-to-clipboard via opentui's onCopySelection callback
  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return

    await Clipboard.copy(text)
      .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
      .catch(toast.error)

    renderer.clearSelection()
  }
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true))

  // kilocode_change start — notify server which session the user is viewing (for live session indicators)
  createEffect(() => {
    const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
    sdk.client.session.viewed({ sessionID }).catch(() => {})
  })
  // kilocode_change end

  // kilocode_change start — evict per-session data from store when navigating away
  createEffect(
    on(
      () => (route.data.type === "session" ? route.data.sessionID : undefined),
      (current, prev) => {
        if (prev && prev !== current) sync.session.evict(prev)
      },
    ),
  )
  // kilocode_change end

  // Update terminal window title based on current route and session
  createEffect(() => {
    if (!terminalTitleEnabled() || Flag.KILO_DISABLE_TERMINAL_TITLE) return

    const titleDefault = "Kilo CLI" // kilocode_change

    if (route.data.type === "home") {
      renderer.setTerminalTitle(titleDefault) // kilocode_change
      return
    }

    if (route.data.type === "session") {
      const session = sync.session.get(route.data.sessionID)
      if (!session || SessionApi.isDefaultTitle(session.title)) {
        renderer.setTerminalTitle(titleDefault) // kilocode_change
        return
      }

      // Truncate title to 40 chars max
      const title = session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title
      renderer.setTerminalTitle(`${titleDefault} | ${title}`) // kilocode_change
    }
  })

  const args = useArgs()
  onMount(() => {
    batch(() => {
      if (args.agent) local.agent.set(args.agent)
      if (args.model) {
        const { providerID, modelID } = Provider.parseModel(args.model)
        if (!providerID || !modelID)
          return toast.show({
            variant: "warning",
            message: `Invalid model format: ${args.model}`,
            duration: 3000,
          })
        local.model.set({ providerID, modelID }, { recent: true })
      }
      // Handle --session without --fork immediately (fork is handled in createEffect below)
      if (args.sessionID && !args.fork) {
        route.navigate({
          type: "session",
          sessionID: args.sessionID,
        })
      }
    })
  })

  let continued = false
  createEffect(() => {
    // When using -c, session list is loaded in blocking phase, so we can navigate at "partial"
    if (continued || sync.status === "loading" || !args.continue) return
    const match = sync.data.session
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .find((x) => x.parentID === undefined)?.id
    if (match) {
      continued = true
      if (args.fork) {
        sdk.client.session.fork({ sessionID: match }).then((result) => {
          if (result.data?.id) {
            route.navigate({ type: "session", sessionID: result.data.id })
          } else {
            toast.show({ message: "Failed to fork session", variant: "error" })
          }
        })
      } else {
        route.navigate({ type: "session", sessionID: match })
      }
    }
  })

  // Handle --session with --fork: wait for sync to be fully complete before forking
  // (session list loads in non-blocking phase for --session, so we must wait for "complete"
  // to avoid a race where reconcile overwrites the newly forked session)
  let forked = false
  createEffect(() => {
    if (forked || sync.status !== "complete" || !args.sessionID || !args.fork) return
    forked = true
    sdk.client.session.fork({ sessionID: args.sessionID }).then((result) => {
      if (result.data?.id) {
        route.navigate({ type: "session", sessionID: result.data.id })
      } else {
        toast.show({ message: "Failed to fork session", variant: "error" })
      }
    })
  })

  createEffect(
    on(
      () => sync.status === "complete" && sync.data.provider.length === 0,
      (isEmpty, wasEmpty) => {
        // only trigger when we transition into an empty-provider state
        if (!isEmpty || wasEmpty) return
        dialog.replace(() => <DialogProviderList />)
      },
    ),
  )

  const connected = useConnected()
  command.register(() => [
    {
      title: "Switch session",
      value: "session.list",
      keybind: "session_list",
      category: "Session",
      suggested: sync.data.session.length > 0,
      slash: {
        name: "sessions",
        aliases: ["resume", "continue"],
      },
      onSelect: () => {
        // kilocode_change start - request session feedback before switching sessions
        const sessionId = route.data.type === "session" ? route.data.sessionID : undefined
        const showSessionList = () => {
          dialog.replace(() => <DialogSessionList />)
        }
        if (sessionId) {
          requestSessionFeedback(sessionId, showSessionList)
        } else {
          showSessionList()
        }
        // kilocode_change end
      },
    },
    // kilocode_change start - /tasks slash command for scheduled task management
    {
      title: "Manage tasks",
      value: "task.list",
      keybind: "task_list",
      category: "Task",
      suggested: false,
      slash: {
        name: "tasks",
        aliases: ["task"],
      },
      onSelect: () => {
        handleTaskNavigate("list")
      },
    },
    {
      title: "New task",
      value: "task.new",
      category: "Task",
      hidden: true,
      onSelect: () => {
        handleTaskNavigate("new")
      },
    },
    {
      title: "Task help",
      value: "task.help",
      category: "Task",
      hidden: true,
      onSelect: () => {
        dialog.replace(() => <DialogTaskHelp />)
      },
    },
    // kilocode_change end
    ...(Flag.KILO_EXPERIMENTAL_WORKSPACES_TUI
      ? [
          {
            title: "Manage workspaces",
            value: "workspace.list",
            category: "Workspace",
            suggested: true,
            slash: {
              name: "workspaces",
            },
            onSelect: () => {
              dialog.replace(() => <DialogWorkspaceList />)
            },
          },
        ]
      : []),
    {
      title: "New session",
      suggested: route.data.type === "session",
      value: "session.new",
      keybind: "session_new",
      category: "Session",
      slash: {
        name: "new",
        aliases: ["clear"],
      },
      onSelect: () => {
        const current = promptRef.current
        // Don't require focus - if there's any text, preserve it
        const currentPrompt = current?.current?.input ? current.current : undefined
        // kilocode_change start - request session feedback before new session
        const sessionId = route.data.type === "session" ? route.data.sessionID : undefined
        const navigateAndClear = () => {
          route.navigate({
            type: "home",
            initialPrompt: currentPrompt,
          })
          dialog.clear()
        }
        if (sessionId) {
          requestSessionFeedback(sessionId, navigateAndClear)
        } else {
          navigateAndClear()
        }
        // kilocode_change end
      },
    },
    {
      title: "Switch model",
      value: "model.list",
      keybind: "model_list",
      suggested: true,
      category: "Agent",
      slash: {
        name: "models",
      },
      onSelect: () => {
        dialog.replace(() => <DialogModel />)
      },
    },
    {
      title: "Model cycle",
      value: "model.cycle_recent",
      keybind: "model_cycle_recent",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycle(1)
      },
    },
    {
      title: "Model cycle reverse",
      value: "model.cycle_recent_reverse",
      keybind: "model_cycle_recent_reverse",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycle(-1)
      },
    },
    {
      title: "Favorite cycle",
      value: "model.cycle_favorite",
      keybind: "model_cycle_favorite",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycleFavorite(1)
      },
    },
    {
      title: "Favorite cycle reverse",
      value: "model.cycle_favorite_reverse",
      keybind: "model_cycle_favorite_reverse",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycleFavorite(-1)
      },
    },
    {
      title: "Switch agent",
      value: "agent.list",
      keybind: "agent_list",
      category: "Agent",
      slash: {
        name: "agents",
      },
      onSelect: () => {
        dialog.replace(() => <DialogAgent />)
      },
    },
    {
      title: "Toggle MCPs",
      value: "mcp.list",
      category: "Agent",
      slash: {
        name: "mcps",
      },
      onSelect: () => {
        dialog.replace(() => <DialogMcp />)
      },
    },
    {
      title: "Agent cycle",
      value: "agent.cycle",
      keybind: "agent_cycle",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.agent.move(1)
      },
    },
    {
      title: "Variant cycle",
      value: "variant.cycle",
      keybind: "variant_cycle",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.variant.cycle()
      },
    },
    {
      title: "Agent cycle reverse",
      value: "agent.cycle.reverse",
      keybind: "agent_cycle_reverse",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.agent.move(-1)
      },
    },
    {
      title: "Connect provider",
      value: "provider.connect",
      suggested: !connected(),
      slash: {
        name: "connect",
      },
      onSelect: () => {
        dialog.replace(() => <DialogProviderList />)
      },
      category: "Provider",
    },
    {
      title: "View status",
      keybind: "status_view",
      value: "opencode.status",
      slash: {
        name: "status",
      },
      onSelect: () => {
        dialog.replace(() => <DialogStatus />)
      },
      category: "System",
    },
    {
      title: "Switch theme",
      value: "theme.switch",
      keybind: "theme_list",
      slash: {
        name: "themes",
      },
      onSelect: () => {
        dialog.replace(() => <DialogThemeList />)
      },
      category: "System",
    },
    {
      title: "Toggle appearance",
      value: "theme.switch_mode",
      onSelect: (dialog) => {
        setMode(mode() === "dark" ? "light" : "dark")
        dialog.clear()
      },
      category: "System",
    },
    {
      title: "Help",
      value: "help.show",
      slash: {
        name: "help",
      },
      onSelect: () => {
        dialog.replace(() => <DialogHelp />)
      },
      category: "System",
    },
    {
      title: "Open docs",
      value: "docs.open",
      onSelect: () => {
        open("https://kilo.ai/docs").catch(() => {}) // kilocode_change
        dialog.clear()
      },
      category: "System",
    },
    {
      title: "Exit the app",
      value: "app.exit",
      slash: {
        name: "exit",
        aliases: ["quit", "q"],
      },
      // kilocode_change start - request session feedback before exit
      onSelect: () => {
        const sessionId = route.data.type === "session" ? route.data.sessionID : undefined
        if (sessionId) {
          requestSessionFeedback(sessionId, () => exit())
        } else {
          exit()
        }
      },
      // kilocode_change end
      category: "System",
    },
    {
      title: "Toggle debug panel",
      category: "System",
      value: "app.debug",
      onSelect: (dialog) => {
        renderer.toggleDebugOverlay()
        dialog.clear()
      },
    },
    {
      title: "Toggle console",
      category: "System",
      value: "app.console",
      onSelect: (dialog) => {
        renderer.console.toggle()
        dialog.clear()
      },
    },
    {
      title: "Write heap snapshot",
      category: "System",
      value: "app.heap_snapshot",
      onSelect: (dialog) => {
        const path = writeHeapSnapshot()
        toast.show({
          variant: "info",
          message: `Heap snapshot written to ${path}`,
          duration: 5000,
        })
        dialog.clear()
      },
    },
    {
      title: "Suspend terminal",
      value: "terminal.suspend",
      keybind: "terminal_suspend",
      category: "System",
      hidden: true,
      onSelect: () => {
        process.once("SIGCONT", () => {
          renderer.resume()
        })

        renderer.suspend()
        // pid=0 means send the signal to all processes in the process group
        process.kill(0, "SIGTSTP")
      },
    },
    {
      title: terminalTitleEnabled() ? "Disable terminal title" : "Enable terminal title",
      value: "terminal.title.toggle",
      keybind: "terminal_title_toggle",
      category: "System",
      onSelect: (dialog) => {
        setTerminalTitleEnabled((prev) => {
          const next = !prev
          kv.set("terminal_title_enabled", next)
          if (!next) renderer.setTerminalTitle("")
          return next
        })
        dialog.clear()
      },
    },
    {
      title: kv.get("bell_enabled", true) ? "Disable notifications" : "Enable notifications",
      value: "app.toggle.notifications",
      category: "System",
      onSelect: (dialog) => {
        kv.set("bell_enabled", !kv.get("bell_enabled", true))
        dialog.clear()
      },
    },
    {
      title: kv.get("animations_enabled", true) ? "Disable animations" : "Enable animations",
      value: "app.toggle.animations",
      category: "System",
      onSelect: (dialog) => {
        kv.set("animations_enabled", !kv.get("animations_enabled", true))
        dialog.clear()
      },
    },
    {
      title: kv.get("diff_wrap_mode", "word") === "word" ? "Disable diff wrapping" : "Enable diff wrapping",
      value: "app.toggle.diffwrap",
      category: "System",
      onSelect: (dialog) => {
        const current = kv.get("diff_wrap_mode", "word")
        kv.set("diff_wrap_mode", current === "word" ? "none" : "word")
        dialog.clear()
      },
    },
  ])

  // kilocode_change start - Initialize TUI dependencies for kilo-gateway
  initializeTUIDependencies({
    useCommandDialog: useCommandDialog,
    useSync: useSync,
    useDialog: useDialog,
    useToast: useToast,
    useTheme: useTheme,
    useSDK: useSDK,
    DialogAlert: DialogAlert,
    DialogSelect: DialogSelect,
    Link: Link,
    Clipboard: Clipboard,
    useKeyboard: useKeyboard,
    TextAttributes: TextAttributes,
  })
  registerKiloCommands(useSDK)
  // kilocode_change end

  // kilocode_change - Delete OpenRouter Alert
  sdk.event.on(TuiEvent.CommandExecute.type, (evt) => {
    command.trigger(evt.properties.command)
  })

  sdk.event.on(TuiEvent.ToastShow.type, (evt) => {
    toast.show({
      title: evt.properties.title,
      message: evt.properties.message,
      variant: evt.properties.variant,
      duration: evt.properties.duration,
    })
  })

  sdk.event.on(TuiEvent.SessionSelect.type, (evt) => {
    route.navigate({
      type: "session",
      sessionID: evt.properties.sessionID,
    })
  })

  // kilocode_change start - Task navigation handler (direct call, no Bus subscription)
  const handleTaskNavigate = (
    action: "new" | "list" | "show" | "edit" | "wizard" | "runs" | "dlq" | "pause" | "resume" | "run" | "delete",
    taskId?: string,
  ) => {
    if (!Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) return

    if (action === "new") {
      if (!Flag.KILOCLAW_SCHEDULED_TASKS_WIZARD_ENABLED && Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task wizard is disabled", duration: 2000 }))
        return
      }
      dialog.replace(() => (
        <DialogTaskWizard
          taskId={taskId}
          onComplete={() => {
            queueMicrotask(() =>
              toast.show({
                variant: "success",
                message: taskId ? "Task updated successfully" : "Task created successfully",
                duration: 3000,
              }),
            )
          }}
        />
      ))
      return
    }

    if (action === "list") {
      if (!Flag.KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED && Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task views are disabled", duration: 2000 }))
        return
      }
      dialog.replace(() => (
        <DialogTaskList
          onSelectTask={(id, act) => handleTaskNavigate(act, id)}
          onCreateNew={() => handleTaskNavigate("new")}
          onClose={() => dialog.clear()}
        />
      ))
      return
    }

    if (action === "show") {
      if (!Flag.KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED && Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task views are disabled", duration: 2000 }))
        return
      }
      if (!taskId) {
        handleTaskNavigate("list")
        return
      }
      dialog.replace(() => (
        <DialogTaskDetail
          taskId={taskId}
          onEdit={() => handleTaskNavigate("wizard", taskId)}
          onRuns={() => handleTaskNavigate("runs", taskId)}
          onDLQ={() => handleTaskNavigate("dlq", taskId)}
          onPause={() => {
            SchedulerControlService.pauseTask(taskId)
            queueMicrotask(() => toast.show({ variant: "info", message: "Task paused", duration: 2000 }))
            handleTaskNavigate("show", taskId)
          }}
          onResume={() => {
            const task = SchedulerControlService.resumeTask(taskId)
            if (!task) {
              queueMicrotask(() => toast.show({ variant: "error", message: "Task not found", duration: 2000 }))
              return
            }
            queueMicrotask(() => toast.show({ variant: "info", message: "Task resumed", duration: 2000 }))
            handleTaskNavigate("show", taskId)
          }}
          onRunNow={() => {
            SchedulerControlService.runNow(taskId, "manual").then((out) => {
              if (out.accepted) {
                queueMicrotask(() => toast.show({ variant: "success", message: "Task executed", duration: 2000 }))
              } else {
                queueMicrotask(() =>
                  toast.show({ variant: "error", message: `Run blocked: ${out.reasonCode}`, duration: 2000 }),
                )
              }
              handleTaskNavigate("show", taskId)
            })
          }}
          onDelete={() => {
            // Show confirmation dialog before delete
            const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
            const taskToDelete = ProactiveTaskStore.get(taskId)
            const taskName = taskToDelete?.name || taskId
            dialog.replace(() => (
              <DialogAlert
                title="Delete Task"
                message={`Are you sure you want to delete "${taskName}"? This cannot be undone.`}
                onConfirm={() => {
                  SchedulerControlService.deleteTask(taskId)
                  queueMicrotask(() => toast.show({ variant: "info", message: "Task deleted", duration: 2000 }))
                  dialog.clear()
                }}
              />
            ))
          }}
          onClose={() => dialog.clear()}
        />
      ))
      return
    }

    if (action === "wizard") {
      // Separate wizard route - opens task wizard for edit
      if (!Flag.KILOCLAW_SCHEDULED_TASKS_WIZARD_ENABLED && Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task wizard is disabled", duration: 2000 }))
        return
      }
      dialog.replace(() => (
        <DialogTaskWizard
          taskId={taskId}
          onComplete={() => {
            queueMicrotask(() =>
              toast.show({ variant: "success", message: "Task updated successfully", duration: 3000 }),
            )
          }}
        />
      ))
      return
    }

    if (action === "runs") {
      if (!Flag.KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED && Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task views are disabled", duration: 2000 }))
        return
      }
      if (!taskId) {
        queueMicrotask(() =>
          toast.show({ variant: "error", message: "Task ID required for runs view", duration: 2000 }),
        )
        return
      }
      dialog.replace(() => <DialogTaskRuns taskId={taskId} onClose={() => dialog.clear()} />)
      return
    }

    if (action === "dlq") {
      if (!Flag.KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED && Flag.KILOCLAW_SCHEDULED_TASKS_ENABLED) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task views are disabled", duration: 2000 }))
        return
      }
      dialog.replace(() => (
        <DialogTaskDLQ
          taskId={taskId}
          onReplayEntry={(entryId) => {
            const replay = SchedulerControlService.replayDlq(entryId)
            if (!replay.accepted) {
              queueMicrotask(() =>
                toast.show({ variant: "error", message: `Replay failed: ${replay.reasonCode}`, duration: 2000 }),
              )
              return
            }
            queueMicrotask(() => toast.show({ variant: "success", message: "DLQ entry replayed", duration: 2000 }))
          }}
          onRemoveEntry={(entryId) => {
            // Show confirmation dialog before removing DLQ entry
            dialog.replace(() => (
              <DialogAlert
                title="Remove DLQ Entry"
                message="Are you sure you want to remove this entry from the DLQ? This cannot be undone."
                onConfirm={() => {
                  const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
                  ProactiveTaskStore.removeFromDLQ(entryId)
                  queueMicrotask(() => toast.show({ variant: "info", message: "DLQ entry removed", duration: 2000 }))
                  handleTaskNavigate("dlq", taskId)
                }}
              />
            ))
          }}
          onClose={() => dialog.clear()}
        />
      ))
    }
  }

  setTaskCommandHandlers({
    list: () => handleTaskNavigate("list"),
    new: () => handleTaskNavigate("new"),
    help: () => command.trigger("task.help"),
    show: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      handleTaskNavigate("show", result.task.id)
    },
    edit: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      handleTaskNavigate("wizard", result.task.id)
    },
    runs: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      handleTaskNavigate("runs", result.task.id)
    },
    dlq: () => handleTaskNavigate("dlq"),
    pause: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      SchedulerControlService.pauseTask(result.task.id)
      queueMicrotask(() => toast.show({ variant: "info", message: "Task paused", duration: 2000 }))
      handleTaskNavigate("show", result.task.id)
    },
    resume: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      const task = SchedulerControlService.resumeTask(result.task.id)
      if (!task) {
        queueMicrotask(() => toast.show({ variant: "error", message: "Task not found", duration: 2000 }))
        return
      }
      queueMicrotask(() => toast.show({ variant: "info", message: "Task resumed", duration: 2000 }))
      handleTaskNavigate("show", result.task.id)
    },
    run: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      SchedulerControlService.runNow(result.task.id, "manual").then((out) => {
        if (out.accepted) {
          queueMicrotask(() => toast.show({ variant: "success", message: "Task executed", duration: 2000 }))
        } else {
          queueMicrotask(() =>
            toast.show({ variant: "error", message: `Run blocked: ${out.reasonCode}`, duration: 2000 }),
          )
        }
        handleTaskNavigate("show", result.task.id)
      })
    },
    delete: (selector) => {
      const result = SchedulerControlService.resolveTask(selector)
      if (!result.ok) {
        const message = result.code === "ambiguous" ? `Ambiguous selector: ${selector}` : `Task not found: ${selector}`
        queueMicrotask(() => toast.show({ variant: "error", message, duration: 2500 }))
        return
      }
      const label = result.task.name || result.task.ref
      dialog.replace(() => (
        <DialogAlert
          title="Delete Task"
          message={`Are you sure you want to delete "${label}"? This cannot be undone.`}
          onConfirm={() => {
            SchedulerControlService.deleteTask(result.task.id)
            queueMicrotask(() => toast.show({ variant: "info", message: "Task deleted", duration: 2000 }))
            dialog.clear()
          }}
        />
      ))
    },
  })
  // kilocode_change end

  sdk.event.on(SessionApi.Event.Deleted.type, (evt) => {
    if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
      route.navigate({ type: "home" })
      toast.show({
        variant: "info",
        message: "The current session was deleted",
      })
    }
  })

  sdk.event.on(SessionApi.Event.Error.type, (evt) => {
    const error = evt.properties.error
    if (error && typeof error === "object" && error.name === "MessageAbortedError") return
    // kilocode_change start - Show warning toast for Kilo errors instead of generic error toast
    if (error && typeof error === "object" && isKiloError(error)) {
      showKiloErrorToast(error, toast)
      return
    }
    // kilocode_change end
    const message = (() => {
      if (!error) return "An error occurred"

      if (typeof error === "object") {
        const data = error.data
        if ("message" in data && typeof data.message === "string") {
          return data.message
        }
      }
      return String(error)
    })()

    toast.show({
      variant: "error",
      message,
      duration: 5000,
    })
  })

  sdk.event.on(Installation.Event.UpdateAvailable.type, (evt) => {
    toast.show({
      variant: "info",
      title: "Update Available",
      message: `Kilo v${evt.properties.version} is available. Run 'kilo upgrade' to update manually.`, // kilocode_change
      duration: 10000,
    })
  })

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      backgroundColor={theme.background}
      onMouseDown={(evt) => {
        if (!Flag.KILO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
        if (evt.button !== MouseButton.RIGHT) return

        if (!Selection.copy(renderer, toast)) return
        evt.preventDefault()
        evt.stopPropagation()
      }}
      onMouseUp={Flag.KILO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? undefined : () => Selection.copy(renderer, toast)}
    >
      <Switch>
        <Match when={route.data.type === "home"}>
          <Home />
        </Match>
        <Match when={route.data.type === "session"}>
          <Session />
        </Match>
      </Switch>
    </box>
  )
}

function ErrorComponent(props: {
  error: Error
  reset: () => void
  onExit: () => Promise<void>
  mode?: "dark" | "light"
}) {
  const term = useTerminalDimensions()
  const renderer = useRenderer()

  const handleExit = async () => {
    renderer.setTerminalTitle("")
    renderer.destroy()
    win32FlushInputBuffer()
    await props.onExit()
  }

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      handleExit()
    }
  })
  const [copied, setCopied] = createSignal(false)

  const issueURL = new URL("https://github.com/Kilo-Org/kilocode/issues/new?template=bug-report.yml")

  // Choose safe fallback colors per mode since theme context may not be available
  const isLight = props.mode === "light"
  const colors = {
    bg: isLight ? "#ffffff" : "#0a0a0a",
    text: isLight ? "#1a1a1a" : "#eeeeee",
    muted: isLight ? "#8a8a8a" : "#808080",
    primary: isLight ? "#3b7dd8" : "#fab283",
  }

  if (props.error.message) {
    issueURL.searchParams.set("title", `opentui: fatal: ${props.error.message}`)
  }

  if (props.error.stack) {
    issueURL.searchParams.set(
      "description",
      "```\n" + props.error.stack.substring(0, 6000 - issueURL.toString().length) + "...\n```",
    )
  }

  issueURL.searchParams.set("opencode-version", Installation.VERSION)

  const copyIssueURL = () => {
    Clipboard.copy(issueURL.toString()).then(() => {
      setCopied(true)
    })
  }

  return (
    <box flexDirection="column" gap={1} backgroundColor={colors.bg}>
      <box flexDirection="row" gap={1} alignItems="center">
        <text attributes={TextAttributes.BOLD} fg={colors.text}>
          Please report an issue.
        </text>
        <box onMouseUp={copyIssueURL} backgroundColor={colors.primary} padding={1}>
          <text attributes={TextAttributes.BOLD} fg={colors.bg}>
            Copy issue URL (exception info pre-filled)
          </text>
        </box>
        {copied() && <text fg={colors.muted}>Successfully copied</text>}
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={colors.text}>A fatal error occurred!</text>
        <box onMouseUp={props.reset} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.bg}>Reset TUI</text>
        </box>
        <box onMouseUp={handleExit} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.bg}>Exit</text>
        </box>
      </box>
      <scrollbox height={Math.floor(term().height * 0.7)}>
        <text fg={colors.muted}>{props.error.stack}</text>
      </scrollbox>
      <text fg={colors.text}>{props.error.message}</text>
    </box>
  )
}
