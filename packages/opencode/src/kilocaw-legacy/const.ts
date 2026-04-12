import { Installation } from "@/installation"

export const DEFAULT_HEADERS = {
  "HTTP-Referer": "https://kiloclaw.ai",
  "X-Title": "Kiloclaw",
  "User-Agent": `Kiloclaw/${Installation.VERSION}`,
}
