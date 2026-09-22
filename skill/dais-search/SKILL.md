---
name: dais-search
description: |
  Search and browse the DAIS SharePoint site (https://ausdeloitte.sharepoint.com/sites/DAIS) efficiently using pre-resolved site, drive, and folder IDs. Use when the user asks to find, look up, or retrieve content from DAIS, the DAIS SharePoint, or the Deloitte Australia Internal Services site.
---
# DAIS SharePoint Search Skill

## ⚠️ Prerequisite — SharePoint Connector (MCP) Required
This skill MUST have the **SharePoint Connector (MCP)** enabled to function. Without it, all `sp_search`, `sp_list_items`, and `sp_read_file` tool calls will fail. 

If the SharePoint MCP tools are not available in the current session, immediately tell the user:
> "This search requires the SharePoint Connector (MCP) to be enabled. Please enable it in your MyAssist settings and try again."
> If there are Sharepoint tools but the specific `sp_search`, `sp_list_items`, and `sp_read_file` tools are not present, the user likely needs to request access to Sharepoint as this currently in a limited trial. Please tell the user: "Access to the Sharepoint MCP can be requested by the feature form can see at the bottom of this webpage."

Do not attempt to answer from memory or general knowledge as a substitute.

---

## Purpose
Enable fast, targeted searching of the DAIS SharePoint site without needing to re-fetch site or drive metadata each session.

---

## Site Reference

| Field | Value |
|---|---|
| Site URL | `https://ausdeloitte.sharepoint.com/sites/DAIS` |
| Site ID | `ausdeloitte.sharepoint.com,f78777b7-7935-4cee-a2d6-1fa9db78c6d7,c1017bb9-f0c7-43af-b148-a98de4364d6c` |

---

## Drive IDs

| Drive | ID | Use for |
|---|---|---|
| Documents | `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWysjNSEjrOYR7Ej3j-ff6Sz` | Primary document library |
| DAIS Video Library | `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWxPKFzJLUhFRpfCK1LTEHVg` | Video and training recordings |
| Reports | `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWyr_VqUfOWoSaPZJoGgK0ac` | Reports library |
| SiteAssets | `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWyoHOpstUUBTJgWDbjB2oiq` | Policy docs and site page content |

### Drives to skip (system/infrastructure — no useful content)
- Apps for SharePoint: `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWzFOnD4EtFGT4HUnoJ4zT3g`
- Icons: `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWz0VI-M8jYHR6lhgZ_UhNOv`
- Search Config List: `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWwkhCJWA9CRQ6_2Pxpuh7QW`
- VivaHomePageBackup: `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWyFmjyDi2WIQ6FiUgNvE1aA`
- Client Side Assets: `b!t3eH9zV57kyi1h-p23jG17l7AcHH8K9DsUipjeQ2TWzDa0IXVvvDS7n49ltgMysp`

---

## Key Folder IDs (Documents Drive)

| Folder | ID |
|---|---|
| Documents root | `01PVY2LREV5QS5YRIEWRHJSOO63JYSEP5U` |
| EFO Education Series | `01PVY2LRFEA4PLR2KV3RDIACKISNPTQYH6` |
| Impact Day 2026 | `01PVY2LRHU2TR4WIDHVFD3HM2O4MODOU6E` |

---

## User Feedback During Search

Provide running commentary to the user at each stage so they know what is happening. Use plain, concise language. Specifically:

1. **Before searching** — tell the user you are searching DAIS SharePoint and what terms you are using. Example:
   > "Searching DAIS SharePoint for documents related to *[topic]*…"

2. **After search results return** — summarise what was found before deciding what to open. List the relevant file names and a one-line description of each. Example:
   > "I found the following potentially relevant files:\n   > - *Impact Day FAQs.pdf* — FAQ document covering talkin reviews and performance check-ins\n   > - *FY24 Total Contribution Team Member Briefing Pack.pptx* — briefing pack on the EOY review process\n   > I'll now open the most relevant ones to answer your question."

3. **Before reading a file** — name the file you are about to open. Example:
   > "Opening *Impact Day FAQs.pdf* to check for talkin review dates…"

4. **If no relevant results are found** — tell the user plainly what was searched and that nothing relevant came back, then suggest alternative search terms or ask them to clarify.

5. **After reading** — ground your answer in what was found. If a file did not contain the needed information, say so and explain what you did find.

---

## Search Workflow

### Step 1 — Keyword search (default first action)
Use `sp_search` with the query suffixed by `site:ausdeloitte.sharepoint.com/sites/DAIS`.  
This searches across all drives and site page content in a single call. No Drive or Folder IDs are needed.

```
query: "<user keywords> site:ausdeloitte.sharepoint.com/sites/DAIS"
top: 25
entityTypes: ["driveItem"]
```

Increase `top` up to 100 if the user needs broader coverage, or if initial results are sparse.

### Step 2 — Browse a specific library (when user wants to list or navigate)
Use `sp_list_items` with the relevant Drive ID and Folder ID from the tables above.  
Use the Documents root folder ID `01PVY2LREV5QS5YRIEWRHJSOO63JYSEP5U` as the starting point for general browsing.

### Step 3 — Read a file
Once an item ID is known from search or listing, call `sp_read_file` with:
- `driveId`: the Drive ID the file belongs to (check `parentReference.driveId` in search results)
- `itemId`: the item ID from the result
- `format`: use `markdown` for Office documents (docx, pptx, xlsx); use `text` for PDFs

### Step 4 — Do not re-fetch metadata
Do not call `sp_get_site` or `sp_list_drives` — all stable IDs are recorded above.  
Only call `sp_list_drives` again if the user reports a result from a drive not listed here.

---

## Tips
- Search results include a `summary` snippet — use this to assess relevance before reading the full file. Share relevant snippet highlights with the user when listing results.
- SiteAssets holds policy and procedural content embedded in DAIS site pages (e.g. Tax & Legal, FA Resource Management) that may not appear in Documents library browsing.
- Video files (mp4) return metadata only via `sp_read_file`; direct the user to the `webUrl` to view them.
- Always tell the user which files you found, which ones you are opening, and why — do not silently read files in the background.