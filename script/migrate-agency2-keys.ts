#!/usr/bin/env bun

import { $ } from "bun"
import { chmod, copyFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import {
  listVariableNames,
  normalizeBuckets,
  parseKeyLines,
  renderManagedBlock,
  replaceManagedBlock,
  type EnvEntry,
} from "../packages/opencode/src/kiloclaw/agency/key-migration"

const defaultSources = [
  "/home/fulvio/Me4BrAIn/.env",
  "/home/fulvio/Me4BrAIn/docker/.env.geekcom",
  "/home/fulvio/Me4BrAIn/data/harvested_keys.env",
]

const defaultTarget = "/home/fulvio/.config/kilo/.env"

interface Args {
  target: string
  remote: string[]
}

const parseArgs = (argv: string[]): Args => {
  const out: Args = { target: defaultTarget, remote: [] }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--target") {
      const value = argv[i + 1]
      if (!value) throw new Error("--target requires a value")
      out.target = value
      i++
      continue
    }
    if (arg === "--remote") {
      const value = argv[i + 1]
      if (!value) throw new Error("--remote requires host:path")
      out.remote.push(value)
      i++
      continue
    }
  }

  return out
}

const readLocalEntries = async (file: string) => {
  const source = Bun.file(file)
  if (!(await source.exists())) {
    console.warn(`warn local-missing source=${file}`)
    return [] as EnvEntry[]
  }
  const text = await source.text()
  return parseKeyLines(text)
}

const readRemoteEntries = async (spec: string) => {
  const idx = spec.indexOf(":")
  if (idx <= 0) {
    console.warn(`warn remote-invalid spec=${spec}`)
    return [] as EnvEntry[]
  }

  const host = spec.slice(0, idx)
  const path = spec.slice(idx + 1)
  const cmd = await $`ssh -o BatchMode=yes -o ConnectTimeout=10 ${host} cat ${path}`.nothrow()
  if (cmd.exitCode !== 0) {
    console.warn(`warn remote-read-failed source=${spec}`)
    return [] as EnvEntry[]
  }

  return parseKeyLines(cmd.stdout.toString())
}

const createBackup = async (target: string) => {
  const current = Bun.file(target)
  if (!(await current.exists())) return null
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "").replace("T", "-").replace("Z", "Z")
  const backup = `${target}.bak.${stamp}`
  await copyFile(target, backup)
  await chmod(backup, 0o600)
  return backup
}

const ensureDir = async (file: string) => {
  const dir = dirname(file)
  await mkdir(dir, { recursive: true })
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const local = await Promise.all(defaultSources.map(readLocalEntries))
  const remote = await Promise.all(args.remote.map(readRemoteEntries))
  const entries = [...local.flat(), ...remote.flat()]
  const buckets = normalizeBuckets(entries)
  const block = renderManagedBlock(buckets)

  await ensureDir(args.target)
  const targetFile = Bun.file(args.target)
  const current = (await targetFile.exists()) ? await targetFile.text() : ""
  const next = replaceManagedBlock(current, block)

  const backup = await createBackup(args.target)
  await Bun.write(args.target, next)
  await chmod(args.target, 0o600)

  const vars = listVariableNames(buckets)
  const counts = Object.entries(buckets)
    .map(([provider, keys]) => `${provider}=${keys.length}`)
    .join(" ")

  console.log(`sources local=${defaultSources.length} remote=${args.remote.length} parsed=${entries.length}`)
  console.log(`counts ${counts}`)
  console.log(`vars ${vars.join(" ")}`)
  if (backup) console.log(`backup ${backup}`)
  console.log(`target ${args.target}`)
}

main().catch((error) => {
  console.error(`error ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
