# LibreChat – Local Setup (MyAssist)

This repository contains the local development setup for **LibreChat**, configured to work with Deloitte’s **ClearTrack LLM Gateway** and internal model endpoints. This setup is intended to support development and experimentation for **MyAssist**.

---

## What this setup gives you

- A **local LibreChat instance** running via Docker Compose
- **Local source code builds** — changes to your code reflected after rebuild (not pulling pre-built images)
- Support for **Azure OpenAI (AU & US)**, **VertexAI (US)**, and **Anthropic via gateway proxy**
- Integration with **ClearTrack MCP Gateway**
- Local theming via **Deloitte GEL assets** (`client/public/assets`)
- Full control over dependencies and build process
- A structure that can later be deployed to **ClearTrack** (dev / stage / prod)

---

# 🚦 Before You Start

## Join the Repo as a Developer

Request to [join the repo's developer group](https://github.com/orgs/Deloitte-Australia/teams/developers-tt-librechat). This will allow you to create branches and push code.

## Join the DEV User Group

To successfully log in via Azure Auth on local or the [online DEV endpoint](https://librechat-dev.ctk.au.deloitte.com/), you need to be added to the DEV user group in Deloitte's Azure Entra. Request access [here](https://deloitteapac.service-now.com/mysupport?id=sc_cat_item&sys_id=a3c4ad4e332c9e146a61cad24d5c7bcb).

# ⚙️ Set Up

## 1. Clone Repository

Clone the Deloitte LibreChat repository:

```zsh
git clone https://github.com/Deloitte-Australia/tt-librechat.git
cd tt-librechat
```

### Check out the `develop` branch:

```zsh
git checkout origin/develop
```

### Enable `husky` pre-commit hooks

```zsh
npm run prepare
```

## 2. Initialize Submodules

This repository uses Git submodules to include external dependencies. The `rag_api` submodule contains the RAG (Retrieval-Augmented Generation) API code from the [tt-librechat-rag](https://github.com/Deloitte-Australia/tt-librechat-rag) repository. The `admin_panel` submodule contains the admin panel code from the [ea-libreadmin](https://github.com/Deloitte-Australia/ea-libreadmin).

### Initial Setup

After cloning, initialize and clone the submodules:

```zsh
git submodule update --init --recursive
```

This will populate the `rag_api/` folder and the `admin_panel/` folder at the commits pinned by this repository. By default, `git submodule update --remote` follows the `develop` branch; CI can override the tracking branch per superproject branch.

### Updating the Submodule

To pull the latest changes from the submodule's remote repository:

```zsh
git submodule update --remote rag_api
```

Or to update all submodules:

```zsh
git submodule update --remote
```

### Checking Submodule Status

To see the current commit of each submodule:

```zsh
git submodule status
```

### What is a Git Submodule?

A submodule is a Git repository embedded inside another Git repository. It allows us to:

- Keep the RAG API code in a separate repository with its own version control
- Update the RAG API independently of the main LibreChat codebase
- Pin to specific commits or track a branch. Locally we default to `develop`; CI can switch to `main` or `uat` when needed.

The submodule appears as a folder (`rag_api/`) in this repository, but Git treats it as a pointer to a specific commit in the external repository.

**Important**: The RAG API is built from this submodule's source code during local Docker builds. Make sure the submodule is initialized before running Docker Compose, or the RAG API build will fail.

## 3. Verify docker-compose.override.yml

The local build configuration is in `docker-compose.override.yml`. This file should already exist in the repository and contains:

- Build configurations for LibreChat and RAG API
- Caddy reverse proxy setup
- Gateway proxy configuration
- Deloitte GEL asset injection

If for any reason this file is missing, you won't get local builds. Verify it exists:

```zsh
ls -la docker-compose.override.yml
```

## 4. Set up Caddyfile

This allows us to login via Azure Auth locally.

1. Copy the example Deloitte Caddyfile:

```zsh
cp Caddyfile.deloitte.example Caddyfile
```

2. Get your machine hostname:

```zsh
hostname
```

3. Update `Caddyfile` to replace YOURHOSTNAME so it uses your host from step 2 above plus `.local` (for example `AU-ABC123123.local {`).
4. Share that hostname with Ally Fulton (so it can be added as an accepted redirect URL on App Reg). This custom domain enables Deloitte auth locally (instead of `localhost`), as localhost cannot be used for Deloitte App Reg redirect URLs.
5. To check your hostname is accessible on your machine, run `ping yourhostname.local` (e.g. `ping AU-ABC123123.local`). If you get "unknown hostname", continue to _If you cannot ping your hostname_. If your ping returns responses (even timeout responses), continue to _5. Environment configuration_.

### If you cannot ping your hostname

1. Enable privileges on your machine
2. Run `sudo nano /etc/hosts`
3. Use the down arrow to navigate to bottom of hostfile
4. Type: `127.0.0.1 yourhostname.local` (e.g. `127.0.0.1 AU-ABC123123.local`) to add your hostname to the hostfile
5. 'Ctrl-O' to writeout/save
6. 'Enter' to continue
7. 'Ctrl-X' to close
8. Try `ping yourhostname.local` again

## 5. Environment configuration (.env)

Start by copying the example file:

```zsh
cp .env.example .env
```

### Make changes

Update the existing keys below in `.env` (edit the existing entries, do not add new keys unless they don't exist yet):

Tip: ask your AI coding assistant to create (for new) or update (for existing) .env values.

1. `ENDPOINTS=anthropic,custom,agents`
2. `ANTHROPIC_REVERSE_PROXY=http://gateway-proxy:8080/anthropic`
3. `APP_TITLE="MyAssist"`
4. `CUSTOM_FOOTER="⚠️ WARNING: This is a development environment. Do not upload client or confidential data."`
5. `DOMAIN_CLIENT=https://<yourhostname>.local` (for example `https://AU-ABC123123.local`)
6. `DOMAIN_SERVER=https://<yourhostname>.local` (for example `https://AU-ABC123123.local`)
7. `ALLOW_SOCIAL_LOGIN=true`
8. `OPENID_CLIENT_ID=<update with the provided value from another team member>`
9. `OPENID_CLIENT_SECRET=<update with the provided secret from another team member>`
10. `OPENID_ISSUER=<update with the provided issuer URL from another team member>`
11. `OPENID_SESSION_SECRET=<update with the provided secret from another team member>`
12. `OPENID_SCOPE="openid profile email offline_access https://librechat-dev.ctk.au.deloitte.com/access_user"` (the `access_user` scope audiences the login token to LibreChat itself; required for the ClearTrack MCP Gateway's OBO exchange — see the note below)
13. `OPENID_CALLBACK_URL=/oauth/openid/callback`
14. `OPENID_REUSE_TOKENS=true`
15. `OPENID_REUSE_MAX_SESSION_AGE_MS=86400000` (keep equal to `SESSION_EXPIRY` and `REFRESH_TOKEN_EXPIRY`, both also `86400000`/24h)
16. `OPENID_REQUIRED_ROLE=`
17. `OPENID_REQUIRED_ROLE_TOKEN_KIND=id`
18. `OPENID_BUTTON_LABEL="Continue with SSO"`
19. `OPENID_IMAGE_URL=/assets/icon-192x192.png`
20. `ALLOW_EMAIL_LOGIN=false`
21. `ALLOW_REGISTRATION=false`
22. `ALLOW_SOCIAL_REGISTRATION=false`
23. Comment out `OPENAI_API_KEY=`
24. Comment out `ASSISTANTS_API_KEY=`
25. BASE_URL_AZURE_AU=https://au-openai-exp.ctk.au.deloitte.com/openai/v1
26. BASE_URL_AZURE_US=https://us-openai-exp.ctk.au.deloitte.com/openai/v1
27. BASE_URL_VERTEXAI=https://us-vertexai-exp.ctk.au.deloitte.com
28. `BASE_URL_AZURE_GLOBAL=https://us-foundry-exp.ctk.au.deloitte.com/openai/v1`
29. `BASE_URL_AZURE_FOUNDRY_AU=https://au-foundry-exp.ctk.au.deloitte.com/openai/v1`
30. `AZURE_OPENAI_GLOBAL_HOST=https://us-openai-exp.ctk.au.deloitte.com/openai/v1`
31. `RAG_OPENAI_REGIONAL_BASEURL=http://gateway-proxy:8081/azure-au`
32. `RAG_OPENAI_GLOBAL_BASEURL=http://gateway-proxy:8081/azure-global`
33. `BEDROCK_AWS_DEFAULT_REGION=ap-southeast-2`
34. `BEDROCK_AWS_ACCESS_KEY_ID=unused`
35. `BEDROCK_AWS_SECRET_ACCESS_KEY=unused`
36. `BEDROCK_AWS_MODELS=au.anthropic.claude-sonnet-4-6,au.anthropic.claude-haiku-4-5-20251001-v1:0`
37. `BEDROCK_REVERSE_PROXY=au-bedrock-exp.ctk.au.deloitte.com`
38. `BEDROCK_GATEWAY_URL=http://gateway-proxy:8081`
39. `LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION="<YOUR_ID_TOKEN>"`
40. `MCP_GATEWAY_URL=https://mcp-gw-dev.ctk.au.deloitte.com/mcp`
41. `MCP_GATEWAY_TOOLSETS=teams,research,news,kx,desc,gims,sharepoint`
42. `MCP_GATEWAY_OBO_SCOPE=api://3e5d28f1-91a3-4748-ad73-5fa544f1d3e2/access_as_user`
43. `USE_ENTRA_ID_FOR_PEOPLE_SEARCH=true` to synchronize Entra group memberships used by restricted MCP servers such as SharePoint.
44. `OPENID_GRAPH_SCOPES=User.Read,GroupMember.Read.All`. `GroupMember.Read.All` must have delegated tenant-admin consent on the LibreChat/MyAssist app registration. Add `People.Read` only when Entra people search is needed and that permission has also been granted.

After changing either Entra setting, rebuild/restart the API container and sign out and back in. Group-restricted MCP servers fail closed: SharePoint stays hidden until the signed-in user's memberships have synchronized successfully.

> The **ClearTrack MCP Gateway** connection (`mcpServers` block in `librechat.yaml` at repo root and `charts/config/librechat.yaml` for Helm) uses On-Behalf-Of (OBO) auth, not a dedicated OAuth client — it reuses `OPENID_CLIENT_ID`/`OPENID_CLIENT_SECRET` from item 8–9 to exchange the user's login token for one scoped to the gateway. There are no gateway-specific client credentials to set; the only requirement is that `OPENID_SCOPE` (item 12) includes the gateway's audience scope.

## Sharing Chats .env vars

```env
ALLOW_SHARED_LINKS=false
ALLOW_SHARED_LINKS_PUBLIC=false
SHARED_LINKS_SNAPSHOT_FILES=false
```

### Balance .env vars

The `balance` block in `librechat.yaml` enables token balance tracking with a daily auto-refill. It reads these values from `.env`:

```env
START_BALANCE=15000000
BALANCE_REFILL_AMOUNT=15000000
CHECK_BALANCE=true
```

`CHECK_BALANCE` (`true`/`false`) turns balance tracking on or off. `START_BALANCE` is the starting token balance for new users; `BALANCE_REFILL_AMOUNT` is the number of tokens added per refill cycle (1 day). The Helm charts set both in `values-uat.yaml` and `values-prd.yaml` (10 million tokens = $10 per day).

### Code API / Code Interpreter .env vars

Add the following values to `.env` to enable the Run Code button for code execution:

```env
LIBRECHAT_CODE_BASEURL=https://code-runtime-dev.ctk.au.deloitte.com/v1
CODEAPI_AUTH_PROVIDER=librechat-jwt
CODEAPI_JWT_ALGORITHM=EdDSA
CODEAPI_JWT_KID=lc-codeapi-dev-2026-05
CODEAPI_JWT_ISSUER=librechat
CODEAPI_JWT_AUDIENCE=codeapi
CODEAPI_JWT_TTL_SECONDS=300
CODEAPI_JWT_MINT_CACHE_SECONDS=30
CODEAPI_JWT_SINGLE_TENANT_ID=legacy
CODEAPI_JWT_PRIVATE_JWK_JSON=<request from a team member; ask Kiel for the current value>
```

`CODEAPI_JWT_PRIVATE_JWK_JSON` is private key material. Do not commit it, paste it into tickets, or share it in chat. Request the current value from a team member; Kiel can direct you to the appropriate owner.

### Skill Scanner .env vars

Add the following values to `.env` to enable the Security Scanning for saving/uploading skills.

`SKILL_SCANNER_URL=https://ai-registry-dev.ctk.au.deloitte.com/v1/scan?verbose=false`
`SKILL_SCANNER_TIMEOUT_MS=15000`
`SKILL_SCANNER_MIN_SEVERITY=high`
`AI_REGISTRY_CLIENT_ID=<update with the provided AI Registry client ID from another team member>` (DEV & UAT use `4aeebbdc-56f5-4329-b40e-3d0a243bf74a`)

> The **Skill Security Scanner** screens every skill through the Deloitte AI Registry before it is saved. Leaving `SKILL_SCANNER_URL` unset disables scanning entirely — skills are then saved unchecked, with no warning. Like the MCP Gateway, it uses On-Behalf-Of auth reusing `OPENID_CLIENT_ID`/`OPENID_CLIENT_SECRET`, scoped to `api://<AI_REGISTRY_CLIENT_ID>/access_as_user` (requires admin consent on that Entra ID app — a one-time infra setup step). Non-OpenID users, or requests made before that consent is granted, are sent unauthenticated. `SKILL_SCANNER_MIN_SEVERITY` sets the lowest finding severity that blocks a skill (`info`, `low`, `medium`, `high`, `critical`); findings below that threshold are reported but do not block.

### Evaluation framework variables

The optional Python evaluation framework reads the following variables from the repository `.env` file:

| Variable                        | Purpose                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `LIBRECHAT_BASE_URL`            | LibreChat instance to evaluate; defaults to `http://localhost:3080`.                                                            |
| `LIBRECHAT_API_KEY`             | Agent API key from LibreChat Settings → Data. Required for agent evals.                                                         |
| `LIBRECHAT_AGENT_ID`            | Default agent ID. A config-specific variable such as `EXPENSE_ASSIST_AGENT_ID` can be referenced by `agent_id: ${VAR}` instead. |
| `LIBRECHAT_TIMEOUT`             | LibreChat request timeout in seconds; defaults to `300`.                                                                        |
| `LIBRECHAT_MAX_RETRIES`         | Maximum LibreChat request retries; defaults to `3`.                                                                             |
| `LIBRECHAT_RETRY_BACKOFF`       | Retry backoff in seconds; defaults to `5`.                                                                                      |
| `EVAL_JUDGE_ENDPOINT`           | Optional custom endpoint name from `librechat.yaml` for DeepEval judge calls.                                                   |
| `EVAL_JUDGE_MODEL`              | Optional judge model override.                                                                                                  |
| `EVAL_JUDGE_DISABLE_TLS_VERIFY` | Set to `1` only for local judge endpoints with untrusted certificates.                                                          |
| `EVAL_ROOT`                     | Optional override for the eval workspace root.                                                                                  |
| `EVAL_LANGFUSE_BASE_URL`        | Optional Langfuse URL used by eval dataset and telemetry integrations.                                                          |
| `EVAL_PUSH_LANGFUSE`            | Set to `1` to export eval telemetry without passing `--langfuse`.                                                               |
| `EVAL_LANGFUSE_ENVIRONMENT`     | Langfuse environment tag; defaults to `development`.                                                                            |
| `LANGFUSE_SSL_VERIFY`           | Set to `false` only for local development with an untrusted Langfuse certificate.                                               |
| `LANGFUSE_SSL_CERT_FILE`        | Optional CA bundle used to verify Langfuse OTLP TLS.                                                                            |

The existing `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_EXPORTER_OTLP_HEADERS` variables are also reused when Langfuse export is enabled. See `evals/_eval/README.md` for commands and examples.

#### How to obtain the JWT token

⚠️ As of May 2026, tokens expire after ~8 hours. If models suddenly stop working, reissue the token.

1. Navigate to [here](https://login.microsoftonline.com/36da45f1-dd2c-4d1f-af13-5abe46b99921/oauth2/v2.0/authorize?client_id=498ce9fd-195b-40c5-82f1-8fc4a6d00d88&response_type=id_token&redirect_uri=https%3A%2F%2Fjwt.ms&scope=openid%20profile%20email%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read&response_mode=fragment&state=random_state&nonce=random_nonce)
2. Copy the whole value to LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION inside quotation marks

## Updating your JWT token

If you want to update your token after it has expired, navigate to
the URL above, get your new token, then run:

    ./update-token.sh "<YOUR_TOKEN_HERE>"

This updates `LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION`, `ANTHROPIC_API_KEY`, `RAG_OPENAI_API_KEY`, and `OPENAI_API_KEY` in `.env`, then restarts the affected containers. Note: passing the token as an argument may save it in your shell history; run `
` with no arguments to be prompted securely.

---

## `librechat.yaml` files

LibreChat configuration includes:

- Custom Azure AU / US endpoints
- VertexAI models
- Anthropic models via the gateway proxy
- Default visible models in the UI
- ClearTrack MCP integration
- And more!

### Claude model availability

The gateway configuration and curated model selector enable the following models. Claude 5.5 models are provisioned in all environments (development, UAT and production).

```dotenv
ANTHROPIC_MODELS=claude-haiku-4-5,claude-haiku-5-5,claude-sonnet-4-6,claude-sonnet-5,claude-sonnet-5-5,claude-opus-4-6,claude-opus-4-8,claude-opus-5-5
BEDROCK_AWS_MODELS=au.anthropic.claude-sonnet-4-6,au.anthropic.claude-haiku-4-5-20251001-v1:0,au.anthropic.claude-haiku-5-5,au.anthropic.claude-sonnet-5-5,au.anthropic.claude-opus-5-5
```

| Model             | Global gateway | Australian regional Bedrock |
| ----------------- | -------------- | --------------------------- |
| Claude Haiku 4.5  | Yes            | Yes                         |
| Claude Haiku 5.5  | Yes            | Yes                         |
| Claude Sonnet 4.6 | Yes            | Yes                         |
| Claude Sonnet 5   | Yes            | No                          |
| Claude Sonnet 5.5 | Yes            | Yes                         |
| Claude Opus 4.6   | Yes            | No                          |
| Claude Opus 4.8   | Yes            | No                          |
| Claude Opus 5.5   | Yes            | Yes                         |

Australian regional models are accessed through the Bedrock endpoint. Use an Australian regional model when the workload must remain in Australia.

There is now **one source of truth** for LibreChat config:

1. `librechat.yaml` (repo root)
   - Used by local Docker runs.
   - Includes local gateway identity headers (`x-id-token`) for custom endpoints.

2. `charts/config/librechat.yaml` (symlink)
   - Points to the root file to keep local and deployment config in sync.
   - During `build-and-promote`, CI materializes a deployment copy by:
     - removing local-only `x-id-token` headers, and
     - ensuring `fileStrategy: "azure_blob"` is present for Kubernetes.
   - In deployed environments, auth is injected by `llm-gateway-proxy` as `x-sa-token` using the pod service account token.

---

## Docker Compose Setup

This local setup uses Docker Compose with two configuration files:

### `docker-compose.yml` (Base)

- Defines all services: LibreChat API, MongoDB, Meilisearch, VectorDB, RAG API
- References pre-built images by default (not modified directly per project convention)

### `docker-compose.override.yml` (Local Customizations)

- **Automatically merged** with the base file when running `docker compose` commands
- Overrides the base configuration to build LibreChat and RAG API from **local source code**
- Adds local-specific services: Caddy (reverse proxy), gateway-proxy (nginx)

### Local Builds from Source

Unlike CI/CD deployments, your local environment builds images from your source code:

- **LibreChat**: Built from root `Dockerfile` (includes api + React client)
- **RAG API**: Built from `rag_api/Dockerfile.lite` (submodule source)

**First-time build expectations**:

- Total time: ~10-15 minutes
  - LibreChat: ~8-12 minutes (npm install + React build)
  - RAG API: ~3-5 minutes (pip install)
- Subsequent builds with Docker layer caching: ~30 seconds - 2 minutes
- Only changed code layers rebuild (much faster after first build)

**Why build locally?**

- Changes to your code are immediately reflected after rebuild
- Full control over dependencies and build process
- No reliance on external registries being available
- Can modify Dockerfiles, add debug tools, etc.

# 🚀 Running the app

## Start services

**First time**: Build and start all services (will take ~10-15 minutes for initial build):

### If this is your first time running the containers, you will need to pull them using

```zsh
docker compose build --no-cache
```

### For all other times start here:

```zsh
docker compose up -d
```

Docker Compose will:

1. Build LibreChat from your local source code
2. Build RAG API from the `rag_api` submodule
3. Pull supporting images (MongoDB, Meilisearch, etc.)
4. Start all containers

**After code changes**: Rebuild and restart to reflect your changes:

```zsh
docker compose up -d --build
```

**Clean restart** (if things behave oddly):

```zsh
docker compose down
docker compose up -d
```

**Full rebuild** (clears cache, rebuilds everything from scratch):

```zsh
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Build Progress

You can watch the build progress in real-time:

```zsh
docker compose up --build --progress=plain
```

(Optional) To use the debug Dockerfile (`temporary_verbose_deloitte_dockerfile.Dockerfile`) locally, temporarily set `services.api.build.dockerfile` in `docker-compose.override.yml` to that filename.

## When to rebuild

You need to rebuild images when you change:

- **Source code** in `/api`, `/client`, `/packages`, or `rag_api/`
- **Dependencies** (`package.json`, `requirements.txt`, etc.)
- **Dockerfiles** (`Dockerfile`, `rag_api/Dockerfile.lite`)

You do NOT need to rebuild for:

- **Configuration file changes** (`.env`, `librechat.yaml`, `Caddyfile`) — just restart containers

To apply config changes without rebuilding:

```zsh
docker compose restart
```

## Access the app

Open your configured `DOMAIN_CLIENT` URL in **Safari** (e.g. `https://AU-ABC123123.local`). You should see the LibreChat login page.

Note that you must use **VPN** to access the LLM Gateway.

---

## Running the frontend directly (outside Docker)

For fast iteration on frontend-only changes, you can skip the Docker rebuild loop and run the Vite dev server directly against your already-running backend container:

```zsh
BACKEND_PORT=3080 npm run frontend:dev
```

This starts Vite on `http://localhost:3090` with hot module reload, proxying API calls to `BACKEND_PORT`.

### Telling parallel instances apart (`VITE_WORKSPACE_NAME`)

If you run more than one frontend at once — e.g. separate git worktrees/branches, or multiple [Conductor](https://conductor.build) workspaces — set `VITE_WORKSPACE_NAME` when starting the dev server:

```zsh
VITE_WORKSPACE_NAME="my-branch" PORT=3091 npm run frontend:dev
```

This appends `/ my-branch` to the Deloitte header title in the browser, so you can tell which tab belongs to which instance at a glance instead of every tab looking identical. It's a one-off env var for the process running `npm run frontend:dev` — it doesn't need to be added to `.env`, and has no effect on the Docker Compose workflow.

---

## VPN gotcha

You may need to **swap VPN state** during setup:

- **Building images** → ❌ VPN Off (for npm/pip package downloads)
- **Pulling Docker images** → ❌ VPN Off
- **Running models via gateway** → ✅ VPN On

If models fail with gateway or MCP errors, this is almost always the cause. If builds hang during dependency installation, turn off VPN.

---

## Troubleshooting

### Build succeeds but SSO says "An unknown error occurred"

Ensure that the `OPENID_ISSUER`, `OPENID_CLIENT_ID`, and `OPENID_CLIENT_SECRET` values in your `.env` are populated. Get these values from another team member if you don't have them.

### Build fails with "context" or "Dockerfile" errors

Ensure the `rag_api` submodule is initialized:

```zsh
git submodule update --init --recursive
```

If the `rag_api` folder is empty, Docker cannot build the RAG API image.

### Build is very slow or hangs

**First-time builds** take 10-15 minutes - this is normal. Subsequent builds are much faster due to layer caching.

If npm/pip install hangs during build:

- Turn off VPN during the build
- Check your internet connection
- Try building with `--no-cache` to bypass corrupted cache layers

### Docker image pull hangs or fails

Supporting services (MongoDB, Meilisearch, etc.) use pre-built images. If pulls hang:

```zsh
unset https_proxy
unset http_proxy
```

Manual pulls if needed:

```zsh
docker pull mongo:8.0.20
docker pull getmeili/meilisearch:v1.35.1
docker pull pgvector/pgvector:0.8.0-pg15-trixie
```

You can also enable proxies to get downloads working on Deloitte wifi:

```zsh
export http_proxy=http://10.42.250.14:80
export https_proxy=http://10.42.250.14:80
```

### MongoDB version error

If you see `featureCompatibilityVersion` errors:

```zsh
docker rmi mongo:8.0.20
docker compose down
docker compose up -d
```

### Build succeeds but containers fail to start

Open the Docker Desktop app to see logs in more detail.

Common issues:

- `.env` file missing or incorrectly configured
- `librechat.yaml` syntax errors
- Port conflicts (3080 already in use)

### No model responses

- Refresh the browser
- Start a new chat
- Update JWT value in .env
- Confirm VPN is **on**

---

# 🟢 Deloitte App Reg

Deloitte App Reg is used to manage the Azure Entra authentication for this app.

For LOCAL development, we need to add each user's hostname to the Redirect URIs list in the "Authentication" tab of the App Registration. This is required because Deloitte's Azure Entra does not allow `localhost` in Redirect URIs, so we use a custom domain (e.g. `AU-ABC123123.local`) for local development instead.

### Details Per Environment

- **DEV (Inc. LOCAL):** [AU CTK_TT_Librechat NONPROD](https://appreg.iam.deloitteresources.com/AppProperties/2075976d-5147-47b2-89d2-4ad060d19f85)
- **UAT:** [AU CTK_TT_Librechat UAT NONPROD](https://appreg.iam.deloitteresources.com/AppProperties/66cc6e2e-670a-47c9-a362-94c86c46782a)
- **PROD:** [AU CTK_TT_Librechat PROD](https://appreg.iam.deloitteresources.com/AppSecrets/b5494d82-9ae5-449e-8867-6804ccc2f5ef)

### Configuration

1. Setup Method: WebAPI/OIDC
2. Authentication Tab: Configured Identifier URI and Redirect URIs
3. Secrets Tab: Generated a client secret, used for local `.env` configuration and, where applicable, the relevant Helm `values*.yaml` under `charts/`
4. Permissions Tab: Enable the following permissions: User.ReadBasic.All, email, openid, profile, offline_access, User.Read, and delegated Microsoft Graph GroupMember.Read.All. GroupMember.Read.All requires tenant admin consent and is used to synchronize memberships for group-restricted MCP servers such as SharePoint.
5. Offered API(s) Tab: Add the access_user suffix to "Scopes defined by this api". Copy from DEV configuration.
6. Users and Groups: Set "Assignment Required" to "Enabled" and choose access group.

- DEV: Linked to the MyAssist DEV user group (AU_App_MyGenAI_Dev, request access [here](https://deloitteapac.service-now.com/mysupport?id=sc_cat_item&sys_id=a3c4ad4e332c9e146a61cad24d5c7bcb))
- UAT: Linked to the MyAssist UAT user Group (AU_App_MyGenAI_Stg, request access [here](https://deloitteapac.service-now.com/mysupport?id=sc_cat_item&sys_id=a3c4ad4e332c9e146a61cad24d5c7bcb))
- PRD: Linked to the MyAssist UAT user Group (AU_App_MyGenAI_Stg, request access [here](https://deloitteapac.service-now.com/mysupport?id=sc_cat_item&sys_id=a3c4ad4e332c9e146a61cad24d5c7bcb))

# 🔗 MCP Access

The SharePoint MCP is restricted in all environments to this Azure Entra group: [AU_MA_MCP_SHAREPOINT_USERS](https://portal.azure.com/?ocid=AIDcmmpi82d2sl_SEM__k_CjwKCAjwxeHWBhBPEiwAiqtQ-Vj1ZoC2y5NW7jluDLaotXWgX7TXwOzxklNMQ7s0ZQ-SPn5OEQv0KRoC7XYQAvD_BwE_k_#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Members/groupId/00c0efc7-e8a7-448c-9480-834cbf1ebd60/menuId/). Jack Walkinshaw and Alex Rabbetts can add members to the group.

# 🔐 Security

Security reviews are performed by **PrismaScan** and **Checkmarx**. You'll see high level results within the PR comments.

For more detail, reach out to Ben Kwan and request to be added to the _tt-librechat_ project, then see the results at [Checkmarx](https://anz.ast.checkmarx.net/). Note, Checkmarx is buggy in Safari, so use Chrome instead.

# 🔢 Database Connection in VS Code

You can connect to the MongoDB in VS Code, to see dev/uat/prod data.

## MongoDB

See instructions [here](https://github.com/Deloitte-Australia/dep-infrastructure/wiki/Connecting-to-MongoDB-Atlas)
