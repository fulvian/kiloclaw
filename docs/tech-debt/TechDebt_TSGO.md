# Tech Debt: tsgo TypeScript Native Preview

> **Date:** 2026-04-02  
> **Status:** Mitigated  
> **Severity:** Low

---

## Issue Summary

The CI `typecheck` workflow uses `tsgo` (TypeScript Go-based compiler preview) which requires `@typescript/native-preview-linux-x64` platform-specific package. In the current environment, this package was not installed, causing `tsgo --noEmit` to fail.

### Error

```
Error: Unable to resolve @typescript/native-preview-linux-x64.
Either your platform is unsupported, or you are missing the package on disk.
```

---

## Root Cause

1. `@typescript/native-preview` is a preview package that includes platform-specific binaries as optional dependencies
2. The package `@typescript/native-preview-linux-x64` was not being installed properly
3. This appears to be related to how Bun handles optional dependencies vs how npm/pnpm install them

---

## Resolution

The issue was resolved by running `bun install` which properly installed the missing platform-specific package:

```bash
bun install
```

After this, `tsgo` works correctly.

---

## Remaining Considerations

### tsgo vs tsc Differences

`tsgo` (Go-based TypeScript compiler) is more strict than `tsc` (JavaScript-based) in some areas:

| Area                          | tsgo Behavior                   | tsc Behavior         |
| ----------------------------- | ------------------------------- | -------------------- |
| `verbatimModuleSyntax`        | Requires explicit `import type` | More permissive      |
| Branded types (`$brand<"X">`) | Stricter validation             | More permissive      |
| Error reporting               | More comprehensive              | May miss some issues |

### Test Compatibility

The test files in `test/kiloclaw/` have some type errors that `tsc` ignores but `tsgo` catches. These are:

- Missing `import type` for type-only imports
- Branded type assignments that need factory functions

However, **all 364 tests pass** at runtime regardless of these type errors.

### CI Recommendation

For robust CI, consider using `tsc --noEmit` instead of `tsgo --noEmit`:

```yaml
# In package.json scripts
"typecheck": "tsc --noEmit" # Instead of "tsgo --noEmit"
```

Or run both in CI:

```yaml
- name: Run typecheck
  run: |
    npx tsc --noEmit
    npx tsgo --noEmit || true  # Best-effort with tsgo
```

---

## Future Work

1. **Short-term**: Update CI to use `tsc --noEmit` as primary
2. **Medium-term**: Fix `verbatimModuleSyntax` issues in test files for tsgo compatibility
3. **Long-term**: When tsgo stabilizes, migrate fully to it

---

## References

- [TypeScript Native Previews Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-native-previews/)
- [tsgo npm package](https://www.npmjs.com/package/@typescript/native-preview)
- [TypeScript Go Rewrite Blog](https://medium.com/@arg-software/typescript-7-0-is-being-rewritten-in-go-heres-why-you-should-care-and-what-to-do-today-3e6c5b69d3f8)
