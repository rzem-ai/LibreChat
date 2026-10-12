# Unified File Upload

- Single attach button replaces the old 4-way destination menu (provider/image, OCR text, file search, code environment).
- Routing is now inferred automatically per file type instead of the user picking a destination.
- Images always go straight to the provider — unchanged behavior, just no manual menu click needed now.
- Agents behave identically to the default endpoint — same routing, same file_search/code interpreter rules.
- If a tool isn't active this turn, previously-extracted text is used as a fallback instead of nothing.
- Based on upstream LibreChat's unified upload work, adapted for our setup.
- Plain text/JSON/CSV/etc. hit a 15MB cap, but only when content-filter policy is active.
- PowerPoint has no text extractor, so it's never sent to the model directly — only reachable via file_search/code interpreter.
- Same goes for Word/Excel/PDF, all default to file_search/code_interpreter.
- CSV defaults to Code Interpreter only — excluded from File Search since vector search is a poor fit for tabular data (slow, and not built for row/column lookups).
- If no active tool this turn can read an uploaded file, the model is told so explicitly, rather than silently dropping the file or claiming none exist.

`Default route` key — **Provider**: sent directly to the model (native multimodal input). **Text**: content extracted and pasted into the prompt. **None**: not sent to the model at all; left for File Search/Code Interpreter to fetch only when actually called.

| Category | Default route | Size limit | File Search | Code Interpreter |
|---|---|---|---|---|
| Images | Provider | 512MB (provider caps may be lower)(TBC) | No | Yes |
| PDF | None | 512 MB | Yes | Yes |
| Text / code | Text | 15MB (if content-filter policy active) / 512MB otherwise | Yes | Yes |
| JSON/XML | Text | 15MB (if content-filter policy active) / 512MB otherwise | Mixed | Yes |
| Word / Excel | None | 512MB | Yes | Yes |
| PowerPoint | None | 512MB | Yes | Yes |
| CSV | None | 512MB | No | Yes |
|||||
| Audio (Not Supported) | Provider / Text / None | 512MB | No | No |
| Video (Not Supported) | Provider / None | 512MB | No | No |
| Archives (Not Supported) | None | 512MB | No | Yes |
