# RSS Feed Verification and Validation Report

Prepared 3 November 2026 (AEDT). Companion to `ai-cyber-iam-feeds.opml` (55 feeds, 9 categories).

## Method

Every feed URL went through two independent passes:

1. A researcher per list searched for candidates, checked site autodiscovery (`<link rel="alternate">`) and common paths (`/feed`, `/rss.xml`, `/index.xml`, `/atom.xml`), then fetched the raw XML and parsed it.
2. A separate build script re-fetched every URL that went into the OPML with a browser User-Agent, parsed it with Python ElementTree, and recorded format, feed title, item count and the latest item's date.

**VERIFIED** means both passes saw well-formed RSS 2.0 or Atom with items. **UNVERIFIED** means the feed exists by all accounts but this sandbox's egress could not reach it (bot-blocking or timeouts), so it's included in the OPML with a visible label for you to confirm in your reader.

Overall: 53 of 55 feeds verified. The two ACSC feeds are unverified. Three other feeds (GitHub `releases.atom` for various repos, CISA advisories, NHI Management Group) were dropped entirely because they could not be reached from here, not because they are dead.

### Items worth knowing before importing

- Only Google, Mistral and OpenAI publish official feeds. Anthropic, DeepSeek, Meta AI, Moonshot, Qwen (current site) and xAI do not. For those, the OPML uses two kinds of third-party scraper:
  - **Olshansk/rss-feeds** (GitHub Actions scraper, served from raw.githubusercontent.com). Reliable, but pubDates are date-only and it can lag or silently break when a site redesigns (the Meta AI one appears to have).
  - **RSSHub public mirrors** (`rsshub.ktachibana.party`, `rsshub.rssforever.com`). Volunteer-run, flaky, and `rsshub.app` itself returned 403. If you want durability, self-host RSSHub and point at `/deepseek/news`, `/qwen/blog`, `/huggingface/models/<org>`, `/anthropic/news`.
- Simon Willison appears three times: the full `everything` feed under AI General, and two tag feeds (MCP, security) under Agents and Security. The tag feeds are strict subsets of the full feed, so a reader that dedupes on GUID will handle it; if yours doesn't, drop the two tag feeds.
- Three feeds need a distinctive User-Agent or will intermittently refuse: Reddit (429 on the second pass), BleepingComputer (Cloudflare bot check), Simon Willison (Akamai blocked plain curl). Normal desktop readers are fine.
- Several feeds are Chinese-language on the title line (DeepSeek News, Qwen Blog). Content is model-release news and is still the most current source for those labs.

---

## Part 1: AI Companies

| Company | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| Anthropic | News (Olshansk mirror) `.../feed_anthropic_news.xml` | RSS 2.0 | 286 | "AI for Science expands to foundations and research institutions", 28 Oct 2026 | VERIFIED, third-party |
| Anthropic | Research (Olshansk mirror) `.../feed_anthropic_research.xml` | RSS 2.0 | 191 | "Early progress on accelerating drug development with Claude", 27 Oct 2026 | VERIFIED, third-party |
| DeepSeek | DeepSeek News `rsshub.ktachibana.party/deepseek/news` | RSS 2.0 | 19 | "DeepSeek V4.1 Flash 新版本", 17 Oct 2026 | VERIFIED, third-party |
| DeepSeek | HF models `rsshub.ktachibana.party/huggingface/models/deepseek-ai` | RSS 2.0 | 30 | "deepseek-ai/DeepSeek-V4.1-Flash-1017", 16 Oct 2026 | VERIFIED, third-party |
| Google AI | Google DeepMind Blog `deepmind.google/blog/rss.xml` | RSS 2.0 | 100 | "Speeding up planning decisions with AI", 30 Oct 2026 | VERIFIED, official |
| Google AI | The Keyword: AI `blog.google/technology/ai/rss/` | RSS 2.0 | 20 | "The latest AI news we announced in October 2026", 2 Nov 2026 | VERIFIED, official |
| Meta | Meta Newsroom `about.fb.com/feed/` | RSS 2.0 | 10 | 29 Oct 2026 | VERIFIED, official (company-wide) |
| Meta | AI at Meta Blog (Olshansk mirror) `.../feed_meta_ai.xml` | RSS 2.0 | 88 | 27 Jul 2026 | VERIFIED but STALE |
| Mistral | Mistral Blog `mistral.ai/rss.xml` | RSS 2.0 | 93 | "Le Chonk: Built for Coders, Trusted by Defenders", 29 Oct 2026 | VERIFIED, official |
| Moonshot | HF models `rsshub.ktachibana.party/huggingface/models/moonshotai` | RSS 2.0 | 19 | "moonshotai/Kimi-K3", 1 Sep 2026 | VERIFIED, third-party, model drops only |
| OpenAI | OpenAI News `openai.com/news/rss.xml` | RSS 2.0 | 1346 | "Scaling Git at OpenAI", 2 Nov 2026 | VERIFIED, official |
| Qwen | Qwen Blog `rsshub.ktachibana.party/qwen/blog` | RSS 2.0 | 40 | "Qwen-Image-2.1", 20 Sep 2026 | VERIFIED, third-party |
| xAI | xAI News (Olshansk mirror) `.../feed_xainews.xml` | RSS 2.0 | 85 | "Team Bots: shared AI teammates that learn as they work", 28 Sep 2026 | VERIFIED, third-party |

Per-company notes:

- **Anthropic**: `anthropic.com/rss.xml`, `/feed`, `/news/rss.xml`, `/research/rss.xml`, `/engineering/rss.xml` all 404; no autodiscovery tag. The Engineering feed from the same mirror is filed under AI Development. Also verified from the same repo: `feed_anthropic_red.xml` (Frontier Red Team, 37 items, 27 Oct 2026) and `feed_claude.xml` (claude.com product blog, 301 items, 2 Nov 2026) if you want them. Olshansk mirror serves from raw.githubusercontent.com with date-only pubDates.
- **DeepSeek**: no official feed; `api-docs.deepseek.com/news/rss.xml` returns an HTML soft-200. The RSSHub `deepseek/news` route scrapes the official news page. The `rssforever.com` mirror of the same route returned 0 items and the HF route timed out there, so the OPML uses `ktachibana.party` for both. GitHub `releases.atom` unverified (DeepSeek rarely uses GitHub Releases anyway).
- **Google AI**: DeepMind blog covers Gemini and Gemma model announcements; Keyword AI covers product and roundup posts. Both official. The DeepMind feed has a BOM/encoding quirk that tripped a strict parser on one of two runs; readers won't care. Also verified as alternatives: `blog.google/products/gemini/rss/` (product only), `blog.google/technology/google-deepmind/rss/`, and `developers.googleblog.com/feeds/posts/default` (items lack pubDate).
- **Meta (Muse)**: "Muse" is Meta's new frontier model family. Muse Spark, the first model from Meta Superintelligence Labs (led by Alexandr Wang), was announced 8 April 2026; it's a closed-weight multimodal model powering the Meta AI app, succeeding Llama as Meta's frontier line (open-weight releases continue separately). `ai.meta.com/blog` has no feed. The Olshansk scraper of it has had nothing since July 2026, so either the scraper broke or the blog went quiet; the Newsroom feed is the live official source and is where Muse Spark was announced. `engineering.fb.com/feed/` (9 items, 29 Oct 2026) also verified if you want engineering posts.
- **Mistral**: official feed served with `text/plain` content-type but valid XML. `/feed.xml` and `/news/feed` 404.
- **Moonshot (Kimi)**: `kimi.com/blog` is a Next.js app with no feed (`/blog/rss.xml`, `/en/blog/rss.xml` return HTML 404s); `platform.moonshot.ai/blog/rss.xml` 404. No RSSHub route for the blog. The HF models feed is the only automated signal; watch `kimi.com/blog` manually for K3 posts.
- **OpenAI**: `/blog/rss.xml` serves the identical feed. Sub-feeds `/news/engineering/rss.xml`, `/news/research/rss.xml`, `/news/product/rss.xml` returned Cloudflare 403 to curl; probably fine in a real reader, but unverified so not included.
- **Qwen**: the official Hugo feed `qwenlm.github.io/blog/index.xml` is valid but frozen at 23 Sep 2025 (site now redirects to qwen.ai, which has no feed). The RSSHub `qwen/blog` route is current. Alternative verified: `rsshub.ktachibana.party/huggingface/models/Qwen` (30 items, 12 Oct 2026).
- **xAI**: `x.ai/feed.xml` and `/rss.xml` return Cloudflare challenge pages; `/news/rss.xml` and `/blog/rss.xml` 404. Latest mirrored item is ~5 weeks old; may be xAI's cadence or scraper lag.

---

## Part 2: Topic feeds (top 5 each)

### AI - General

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | Simon Willison's Weblog `simonwillison.net/atom/everything/` | Atom | 30 | "llm 0.37", 2 Nov 2026 | VERIFIED |
| 2 | Import AI `importai.substack.com/feed` | RSS 2.0 | 20 | "Import AI 479", 2 Nov 2026 | VERIFIED |
| 3 | Interconnects `interconnects.ai/feed` | RSS 2.0 | 20 | "Was I wrong about open models & cyber risks?", 30 Oct 2026 | VERIFIED |
| 4 | Ars Technica AI `arstechnica.com/ai/feed/` | RSS 2.0 | 20 | 2 Nov 2026 | VERIFIED |
| 5 | MIT Technology Review AI `technologyreview.com/topic/artificial-intelligence/feed` | RSS 2.0 | 10 | 2 Nov 2026 | VERIFIED |

Why these five:
1. **Willison**: the highest signal-to-noise practitioner source on LLMs, tooling, prompt injection and agent security; near-daily; he tests claims hands-on rather than relaying press releases. One recent entry contained prompt-injection-style text aimed at AI readers, which matters if you pipe this feed into an agent.
2. **Import AI**: Jack Clark's weekly insider digest of research, policy and safety, sober rather than hyped, running since 2016 and still on schedule at issue 479. Best single "what mattered this week" read.
3. **Interconnects**: Nathan Lambert's research-grade analysis of training, open weights, RLHF and the lab landscape, roughly weekly; recent pieces address cyber risk directly.
4. **Ars Technica AI**: the best mainstream AI news desk for substance; daily, technically literate, less funding-round churn than TechCrunch and less gadget bias than The Verge.
5. **MIT Technology Review AI**: authoritative long-form reporting and explainers on research, policy and societal impact. Caveat: the topic feed mixes in sponsored "Insights" content (the latest item is one).

Considered and dropped: The Batch (no working feed, all paths 404); The Gradient (feed valid but dormant since Feb 2026); Last Week in AI (cadence slipped, secondary digest); arXiv cs.AI (~300 items/day, firehose); Hacker News AI via hnrss (noisy keyword scrape); TechCrunch AI (PR heavy); The Verge AI (consumer skew); The Register AI/ML (snark and overlap); BAIR (too infrequent); Marcus on AI (single-note); Every Chain of Thought (404). Strong alternates, all verified and current: Don't Worry About the Vase (Zvi), AI as Normal Technology, Understanding AI.

### AI - Agents

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | Model Context Protocol Blog `blog.modelcontextprotocol.io/index.xml` | RSS 2.0 | 27 | "The Official Ruby SDK for MCP Reaches Tier 1", 30 Oct 2026 | VERIFIED |
| 2 | Simon Willison, MCP tag `simonwillison.net/tags/model-context-protocol.atom` | Atom | 30 | 29 Oct 2026 | VERIFIED |
| 3 | Latent Space `latent.space/feed` | RSS 2.0 | 20 | "Building AI for Lawyers", 2 Nov 2026 | VERIFIED |
| 4 | LangChain Blog `blog.langchain.com/rss.xml` | RSS 2.0 | 100 | "Managed Deep Agents", 2 Nov 2026 | VERIFIED |
| 5 | Cloudflare Blog, agents tag `blog.cloudflare.com/tag/agents/rss/` | RSS 2.0 | 20 | 21 Oct 2026 | VERIFIED |

Why these five:
1. **MCP Blog**: the official project blog; spec changes, roadmap, SDK tiering and authorization/governance decisions straight from the maintainers. Low volume, every post is primary source for MCP architecture work.
2. **Willison MCP tag**: the most sober, technically grounded commentary on agents, tool use and prompt injection (he coined "lethal trifecta"); the tag feed keeps it focused. Subset of the General feed.
3. **Latent Space**: the de facto AI engineering publication and podcast; practitioner interviews on agent harnesses, evals, frameworks and SDKs with people shipping them. Podcast-heavy.
4. **LangChain Blog**: highest-volume source of concrete multi-agent architecture, state/memory patterns and case studies. Vendor-flavoured but engineering-heavy; useful even if you don't use LangChain. Note the commonly cited `/rss/` and `/feed` paths now return HTML; `/rss.xml` is live.
5. **Cloudflare agents tag**: infrastructure-level writing on running agents in production (sandboxing, workers, remote MCP). Vendor-centric, but Cloudflare's agent posts are consistently technical.

Considered and dropped: Embrace The Red and Trail of Bits (both excellent for agents, filed under AI Security instead to avoid duplicates); CrewAI (feed stale since Jun 2026, marketing-heavy); Eugene Yan (stale since Jun 2026); Promptfoo (feed stuck at Mar 2026); Shrivu's Substack (good agent-security essays, latest 8 Sep, low cadence); Hugging Face blog (noisy); Daniel Miessler (broad); Google Developers Blog (no pubDates); Invariant Labs, Lakera, HiddenLayer, Protect AI, Aim, A2A site, O'Reilly Radar (403/404/HTML).

### AI - Image+Video Generation/Manipulation

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | ComfyUI Blog `blog.comfy.org/feed` | RSS 2.0 | 20 | "Higgsfield promised to open source...", 15 Oct 2026 | VERIFIED |
| 2 | Stable Diffusion Art `stable-diffusion-art.com/feed/` | RSS 2.0 | 10 | "AI Desktop Girlfriend in ComfyUI - MiniMax H3", 2 Nov 2026 | VERIFIED |
| 3 | fal.ai Blog `blog.fal.ai/rss/` | RSS 2.0 | 15 | "EAGLE-4 Technical Deepdive", 20 Oct 2026 | VERIFIED |
| 4 | Midjourney Updates `updates.midjourney.com/rss/` | RSS 2.0 | 15 | "Testing Thinking Mode", 8 Oct 2026 | VERIFIED |
| 5 | r/StableDiffusion `reddit.com/r/StableDiffusion/.rss` | Atom | 25 | 17 Oct 2026 (hot ordering; feed updated 3 Nov) | VERIFIED, intermittent |

Why these five:
1. **ComfyUI Blog**: the official Comfy Org blog, now on Substack (old `/rss/` path 404s). Recent posts: FLUX 3 Image Klein in ComfyUI, MiniMax H3 live video on a single GPU, Nvidia VFX nodes, Comfy Agent. Roughly weekly and exactly your beat.
2. **Stable Diffusion Art**: the most active hands-on ComfyUI tutorial source found; every recent post ships a workflow (Qwen Image 2.1, Kandinsky 6.0, MiniMax H3, and a Z-Image Turbo plus ControlNet Union 2.1 piece). Several posts a week.
3. **fal.ai Blog**: genuine inference and serving engineering (EAGLE-4, H3 Max, sub-second Ideogram v4). Monthly-ish; some corporate posts mixed in. Note `fal.ai/blog` and `/rss.xml` 404; the feed lives on the `blog.` subdomain.
4. **Midjourney Updates**: official changelog; weekly alpha changelogs, V8 edit model. Terse, but first-party and a useful benchmark of what the closed frontier ships.
5. **r/StableDiffusion**: still the fastest place open-weights releases, LoRAs, quantisations and workflows surface, often hours before any blog. Noisy. Reddit rate-limits unknown User-Agents (429 on the second pass), so set a distinctive UA in your reader. `r/comfyui/.rss` also verified if you want a narrower feed.

Considered and dropped: Black Forest Labs (no feed at all; track FLUX via ComfyUI and Hugging Face); Stability AI (`/news-updates?format=rss` valid but stale since Aug 2026 and off-topic); Replicate (stale since Apr 2026); Civitai Education (platform how-tos only; civitai.com has no feed); Runway, Kling, LTX, Ostris, ComfyUI-Wiki (no working feed); GitHub `releases.atom` (unverifiable from here). Honourable mention: Hugging Face blog (verified, 894 items, but ~90% non-diffusion and no server-side filter).

### AI - Security

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | Embrace The Red `embracethered.com/blog/index.xml` | RSS 2.0 | 233 | "Visual Studio Copilot and SSMS RCE (CVE-2026-103572)", 13 Oct 2026 | VERIFIED |
| 2 | Simon Willison, security tag `simonwillison.net/tags/security.atom` | Atom | 30 | "How We Took Over ChatGPT Accounts", 31 Oct 2026 | VERIFIED |
| 3 | OWASP Gen AI Security Project `genai.owasp.org/feed/` | RSS 2.0 | 10 | "GenAI and Agentic AI Exploit Roundup Q3 2026", 8 Oct 2026 | VERIFIED |
| 4 | Trail of Bits Blog `blog.trailofbits.com/feed/` | RSS 2.0 | 20 | "Backporting security fixes at scale with Codex", 2 Nov 2026 | VERIFIED |
| 5 | Knostic Blog `knostic.ai/blog/rss.xml` | RSS 2.0 | 20 | "Hallucination or Cross-Tenant", 27 Oct 2026 | VERIFIED, vendor |

Why these five:
1. **Embrace The Red**: Johann Rehberger's blog is the single best primary source for CVE-backed prompt-injection and agent exploitation research against shipping products (Copilot, Claude Code, MCP clients), with disclosure timelines. Independent, zero marketing.
2. **Willison security tag**: the sharpest curation of LLM and agent security news with commentary; tag feed keeps it security-only. Also verified if you want narrower slices: `/tags/prompt-injection.atom` and `/tags/model-context-protocol.atom`.
3. **OWASP Gen AI**: home of the Top 10 for LLM Apps and the Agentic Security Initiative; the canonical vendor-neutral framework source you'd cite in a client deliverable. Low cadence, all reference material.
4. **Trail of Bits**: a top-tier audit firm now publishing heavily on coding agents, agent containment, MCP tooling and agent supply chain. Mixed with non-AI security, so some filtering. The AI-only category feed `blog.trailofbits.com/categories/ai/index.xml` also verified (5 items, 21 Oct 2026) if you'd rather have the subset.
5. **Knostic**: focused on enterprise LLM access control and need-to-know, which is the closest thing to NHI governance in the AI security vendor space. Vendor blog, so apply the usual discount.

Considered and dropped: Lakera, HiddenLayer, Protect AI, Zenity Labs, Invariant Labs, PromptArmor, Pillar, Lasso, Aim, Noma (no feed, 403 or 404); NHI Management Group (403 bot-block, topically very relevant, worth retrying from your reader); Anthropic red/alignment sites (no feed); Google Online Security Blog (valid Atom but latest 10 Apr 2026); Promptfoo (feed broken at Mar 2026); Unit 42, Wiz, NIST news (valid, current, not AI-specific); CISA (403); MSRC (403); Schneier (valid, general); arXiv cs.CR (firehose); MCP Blog (filed under Agents).

### AI - Development

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | Anthropic Engineering Blog (Olshansk mirror) `.../feed_anthropic_engineering.xml` | RSS 2.0 | 27 | "Redesigning source control at Anthropic", 13 Oct 2026 | VERIFIED, third-party |
| 2 | Claude Code Changelog `code.claude.com/docs/en/changelog/rss.xml` | RSS 2.0 | 15 | 2.1.317, 3 Nov 2026 | VERIFIED, official |
| 3 | Hamel's Blog `hamel.dev/index.xml` | RSS 2.0 | 20 | "How To Use Decision Models for Evals", 20 Oct 2026 | VERIFIED |
| 4 | philschmid.de `philschmid.de/rss` | RSS 2.0 | 213 | "Why Agents Are Soon Only Going to Have 1 Tool", 1 Nov 2026 | VERIFIED |
| 5 | Ahead of AI (Sebastian Raschka) `magazine.sebastianraschka.com/feed` | RSS 2.0 | 20 | "Building Reasoning Models from the Ground Up", 24 Oct 2026 | VERIFIED |

Why these five:
1. **Anthropic Engineering**: the canonical source for building-with-Claude engineering posts (agent harnesses, context engineering, Claude Code internals, MCP). No official feed exists, so this is the scraper mirror. Low volume, high quality.
2. **Claude Code Changelog**: official, release-level tracking of the tool your subagent fleet runs on. Daily-ish.
3. **Hamel Husain**: the most practical writing on LLM evals, error analysis and shipping agent systems; pure practitioner, no product.
4. **Philipp Schmid**: short, code-first posts on agent tool design, MCP, fine-tuning and serving; one of the few individual engineers still publishing monthly hands-on material.
5. **Ahead of AI**: deep model-internals and training content; the "understand what's under the hood" complement to the four application-level feeds above.

Considered and dropped: Simon Willison (already under General) and LangChain (under Agents); Eugene Yan (stale since Jun 2026); Lil'Log (~2 posts/year); Chip Huyen (dormant since Jan 2025); OpenAI News (unfiltered firehose; engineering sub-feed 403; cookbook feed 404); Vercel (platform changelog firehose); Pragmatic Engineer (mostly non-AI, paywalled); Thinking Machines (too infrequent); Hugging Face blog (noisy); Martin Fowler (AI is a minority of posts); Cursor changelog (release notes only); Ollama, vLLM, LangChain changelog (no working feed).

### AI - Content Creation

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | Every `every.to/feeds/global.xml` | RSS 2.0 | 50 | "What AI Is Teaching Us About Management", 2 Nov 2026 | VERIFIED |
| 2 | One Useful Thing `oneusefulthing.org/feed` | RSS 2.0 | 20 | "30 Months on the Exponential (in Charts)", 20 Oct 2026 | VERIFIED |
| 3 | Ben's Bites `bensbites.com/feed` | RSS 2.0 | 20 | "AI is overwhelming and I'm doing it wrong", 29 Oct 2026 | VERIFIED |
| 4 | Why Try AI `whytryai.com/feed` | RSS 2.0 | 20 | "Sunday Rundown #163", 1 Nov 2026 | VERIFIED |
| 5 | ElevenLabs Blog `elevenlabs.io/blog/rss.xml` | RSS 2.0 | 50 | 3 Nov 2026 | VERIFIED, vendor |

Why these five:
1. **Every**: the best practitioner source on using AI for writing and knowledge work; near-daily essays by people who build and write with AI. The per-column Chain of Thought feed is valid but stale (Jul 2026), so the global feed is the right subscription; `/feed`, `/rss`, `/feed.xml` return HTML.
2. **One Useful Thing**: Ethan Mollick is the benchmark for thoughtful, evidence-based writing on working with LLMs. Fortnightly to monthly, high signal.
3. **Ben's Bites**: has evolved from a link roundup into practical, hands-on tutorials and workflow pieces.
4. **Why Try AI**: hype-free, hands-on; weekly rundown plus midweek deep dives on prompt craft and AI image, video and voice for creators. Covers the creator-facing slice without being a tool listicle.
5. **ElevenLabs Blog**: first-party source for voice and audio. Currently heavy on enterprise voice-agent case studies and product announcements rather than creator craft, so it's the weakest of the five; swap for The Neuron (`rss.beehiiv.com/feeds/N4eCstxvgX.xml`, verified, daily digest) if you'd rather have news than voice.

Considered and dropped: Simon Willison entries feed (already under General); The Neuron (daily news digest); Lenny's (PM focus); Latent Space (under Agents); Nate's Substack (exec briefings); The Rundown AI (listicle style); Creative AI News (pricing news, thin on craft); Ness Labs (slowing, tangential); Exponential View, Understanding AI, Zvi, Marcus, Strange Loop Canon, Artificial Ignorance, Intrinsic Perspective (all valid, but analysis rather than craft); AI with Allie, Superhuman, AI Corner, AI Supremacy (HTML/404).

### Cyber Security

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | Risky Bulletin `risky.biz/feeds/risky-business-news/` | RSS 2.0 | 100 | "Between Two Nerds: Finding bugs does not mean security", 3 Nov 2026 | VERIFIED |
| 2 | The Record `therecord.media/feed` | RSS 2.0 | 5 | "UK faces 'unprecedented rise' in cyberattacks", 3 Nov 2026 | VERIFIED |
| 3 | SANS Internet Storm Center `isc.sans.edu/rssfeed_full.xml` | RSS 2.0 | 10 | "ISC Stormcast For Tuesday, November 3rd, 2026" | VERIFIED |
| 4 | Krebs on Security `krebsonsecurity.com/feed/` | RSS 2.0 | 10 | "Widespread PHP Flaw May Cause Many Site Outages Today", 21 Oct 2026 | VERIFIED |
| 5 | BleepingComputer `bleepingcomputer.com/feed/` | RSS 2.0 | 15 | "Chinese hackers use ARTEX AI in automated attacks against 200 orgs", 2 Nov 2026 | VERIFIED |
| + | ACSC Alerts `cyber.gov.au/rss/alerts` | ? | ? | ? | UNVERIFIED |
| + | ACSC Advisories `cyber.gov.au/rss/advisories` | ? | ? | ? | UNVERIFIED |

Why these five:
1. **Risky Bulletin**: Catalin Cimpanu's daily curated newsletter for an Australian-founded outlet; each issue compresses incidents, vendor advisories, policy and APAC/Australian regulatory news into one post. Highest signal-to-noise of anything tested and the only top-tier source with an Australian editorial lens.
2. **The Record**: newsroom-quality reporting on nation-state activity, ransomware, policy and critical infrastructure rather than vendor marketing. The feed itself is short (5 items) but refreshes several times a day.
3. **SANS ISC**: daily handler diaries plus the 5-minute Stormcast; practitioner-written, early on in-the-wild exploitation and honeypot trends.
4. **Krebs**: low volume, deeply investigated cybercrime and fraud reporting with a financial-services bent (payments, banking fraud, breach investigations). Worth it precisely because it's sparse.
5. **BleepingComputer**: the best breaking-news feed for CVEs, ransomware incidents and patches; higher volume but consistently first and accurate. Cloudflare bot check on one attempt; browser UA fixed it.

ACSC: both feeds are included in the OPML labelled UNVERIFIED. `cyber.gov.au` dropped the connection on every attempt from this sandbox (empty reply, HTTP/2 stream errors) and WebFetch is robots-blocked for it. Third-party aggregator feeder.co reports `/rss/alerts` active with a post ~10 days ago and `/rss/advisories` ~25 days ago; the legacy `/rss.xml` and `/rssfeed/2` are reported dead. Add them and confirm they populate; `/rss/threats` and `/rss/publications` also exist.

Considered and dropped: Schneier (verified, 2 Nov; essay-oriented, strong sixth); Google Project Zero (verified, 27 Oct; narrow and monthly); The Hacker News (verified; sponsored content); Dark Reading (verified; vendor op-eds); The Register security (overlap); WeLiveSecurity (vendor); SentinelOne (stale, vendor); CISA advisories (403 Akamai, unverifiable from here); Ars Technica security feed (404, no longer exists).

### Identity & Access Management

| # | Feed | Format | Items | Latest item | Status |
|---|---|---|---|---|---|
| 1 | IDPro Blog `idpro.org/feed/` | RSS 2.0 | 3 | "From Non-Human Identity (NHI) to Agent Identity: Defining the Identity Threshold", 1 Nov 2026 | VERIFIED |
| 2 | KuppingerCole `kuppingercole.com/rss.xml` | RSS 2.0 | 116 | "The AI Security Fabric", 29 Oct 2026 | VERIFIED |
| 3 | OpenID Foundation `openid.net/feed/` | RSS 2.0 | 10 | "Defakto joins the OIDF", 20 Oct 2026 | VERIFIED |
| 4 | Phil Windley's Technometria `windley.com/rss.xml` | RSS 2.0 | 10 | "One Billion Thousand-Dollar Markets", 2 Nov 2026 | VERIFIED |
| 5 | Aembit Blog `aembit.io/feed/` | RSS 2.0 | 10 | "MCP Servers vs API Security", 30 Oct 2026 | VERIFIED, vendor |

Why these five:
1. **IDPro**: the practitioner-owned, vendor-neutral body behind the Body of Knowledge; current posts are squarely on NHI and agent identity ("Why Identity Needs a Kill Switch"; the OpenAI/Hugging Face breach as a machine-identity failure). Feed exposes only 3 items, so expect low volume. Tag feed `idpro.org/tag/agentic-ai/feed/` also exists.
2. **KuppingerCole**: the only independent analyst house with IAM at its core and un-paywalled commentary; recent items cover "IAM as a Service", an AI Security Fabric reference architecture, agent prompt injection and sovereignty as IAM risk. Firm-wide feed (blog plus research plus webinars); `/blog/feed` and `/rss` return HTML.
3. **OpenID Foundation**: primary source for OIDC, FAPI, Shared Signals/CAEP and the AI agent identity workstreams; spec approvals and working-group formation land here first. Some membership PR noise. Complement: Mike Jones's `self-issued.info/?feed=rss2` (verified, 8 Sep 2026) for editor-level OAuth/OIDC detail.
4. **Phil Windley**: 20+ years of vendor-neutral identity architecture thinking, now writing directly on agent identity, autonomy and human-in-the-loop control. One to three posts a week; some pico-engine dev content mixed in.
5. **Aembit**: the one vendor slot, used for the closest match to your current focus: workload and NHI identity, MCP security, SPIFFE, OAuth flow comparisons, agent revocation. Mostly educational rather than product-only.

Alternative second vendor if wanted: Microsoft Entra Blog `techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Microsoft-Entra-Blog` (verified, 2 Nov 2026; product-heavy but where Entra Agent ID news lands first).

Considered and dropped: IDSA (valid, but 3-4 posts a year, latest Jul 2026); Identity Woman (Aug 2026, off-topic); CIAM Weekly (verified 2 Nov, good, but CIAM/B2C; strong sixth); Auth0 (verified, dev tutorials, familiar territory); Okta (`/rss.xml` stale at Dec 2023; blog feeds 404); Ping (no feed); SailPoint (404); CyberArk (HTML); IETF OAuth WG (no usable RSS; mailing list instead); NHI Management Group (403); Digital ID Australia (no feed); Ian Glazer (no active feed); Identity Fusion (consultancy marketing); Identiverse (conference-seasonal); Kantara (May 2026); FIDO (passkeys-only member PR); CSA, WorkOS, GitGuardian, OASIS (tangential); InfoQ Identity (0 items); SGNL, Strata, Permit.io (none).

---

## OPML structure

9 folders: AI Companies (13), AI - General (5), AI - Agents (5), AI - Image+Video Generation (5), AI - Security (5), AI - Development (5), AI - Content Creation (5), Cyber Security (7, incl. 2 unverified ACSC), Identity & Access Management (5). Third-party and vendor feeds carry a `description` attribute saying so; the two ACSC entries say UNVERIFIED in their title so they're easy to find after import.
