export namespace Brand {
  export function name() {
    const raw = process.env.KILO_BRAND_NAME?.trim().toLowerCase()
    if (raw === "kiloclaw") return "kiloclaw"
    return "kilo"
  }
}
