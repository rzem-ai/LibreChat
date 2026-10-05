/** Deloitte Custom Change: shared rule deciding whether a model may use native provider web search. */

/** Characters that may terminate a `supportedModels` prefix, covering version, vendor-path
 *  and inference-profile suffixes (`gpt-4o-2024-08-06`, `google/gemini-2.5-pro`, `…-v1:0`). */
const SEPARATOR = /[-._:/]/;

/**
 * Whether `model` supports the native provider web-search tool, per an optional
 * admin-configured allowlist (`endpoints.<provider>.nativeWebSearch.supportedModels`).
 * Permissive when `supportedModels` is undefined (key omitted entirely): every model
 * of that provider/endpoint is treated as supported. When `supportedModels` is an
 * explicit empty array, no model of that provider/endpoint is supported. When a
 * non-empty list is configured, `model` must match an entry exactly or by
 * case-insensitive prefix ending at a separator (e.g. `"gpt-4o"` matches
 * `"gpt-4o-2024-08-06"` but not `"gpt-4o1"`, and `"gpt-4"` does not match `"gpt-41-nano"`).
 *
 * Shared between server (`packages/api`) and client (`client/`) so both sides
 * agree on what counts as "supported."
 */
export function modelSupportsNativeWebSearch(
  model: string | null | undefined,
  supportedModels?: string[],
): boolean {
  if (supportedModels === undefined) {
    return true;
  }
  if (supportedModels.length === 0 || !model) {
    return false;
  }
  const normalizedModel = model.toLowerCase();
  return supportedModels.some((entry) => {
    const normalizedEntry = entry.toLowerCase();
    if (normalizedModel === normalizedEntry) {
      return true;
    }
    return (
      normalizedModel.startsWith(normalizedEntry) &&
      SEPARATOR.test(normalizedModel.charAt(normalizedEntry.length))
    );
  });
}

/** Surfaced to the user when a request slips past the UI gate (stale tab, preset, direct API call). */
export function unsupportedNativeWebSearchMessage(model: string | null | undefined): string {
  return `Web search is not available for the model "${model ?? 'unknown'}". Turn it off or switch to a supported model.`;
}
