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

## 2. Enable Git Hooks

### Enable `husky` pre-commit hooks

```zsh
npm run prepare
```

## 3. Initialize Submodules

This repository uses Git submodules to include external dependencies. The `rag_api` submodule contains the RAG (Retrieval-Augmented Generation) API code from the [tt-librechat-rag](https://github.com/Deloitte-Australia/tt-librechat-rag) repository. The `admin_panel` submodule contains the admin panel code from the [ea-libreadmin](https://github.com/Deloitte-Australia/ea-libreadmin).

### Initial Setup

After cloning, initialize and clone the submodules:

```zsh
git submodule update --init --recursive
```

This will populate the `rag_api/` folder and the `admin_panel/` folder at the commits pinned by this repository. By default, `git submodule update --remote` follows the `develop` branch; CI can override the tracking branch per superproject branch.

### Updating the Submodule

To update all submodules:

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

## 3. Prepare for SSO

This allows us to login via Azure Auth locally.

The `Caddyfile` is generated for you by `quickstart.sh` (see the Quickstart below) from `Caddyfile.deloitte.example`, using your machine hostname plus `.local` (for example `AU-ABC123123.local`). You only need to do the following:

1. Get your machine hostname:

```zsh
hostname
```

2. Share that hostname with Ally Fulton (so it can be added as an accepted redirect URL on App Reg). This custom domain enables Deloitte auth locally (instead of `localhost`), as localhost cannot be used for Deloitte App Reg redirect URLs.
3. To check your hostname is accessible on your machine, run `ping yourhostname.local` (e.g. `ping AU-ABC123123.local`). If you get "unknown hostname", continue to _If you cannot ping your hostname_. If your ping returns responses (even timeout responses), continue to _4. Quickstart_.

### If you cannot ping your hostname

1. Enable privileges on your machine
2. Run `sudo nano /etc/hosts`
3. Use the down arrow to navigate to bottom of hostfile
4. Type: `127.0.0.1 yourhostname.local` (e.g. `127.0.0.1 AU-ABC123123.local`) to add your hostname to the hostfile
5. 'Ctrl-O' to writeout/save
6. 'Enter' to continue
7. 'Ctrl-X' to close
8. Try `ping yourhostname.local` again

## 4. Quickstart

Your `.env` is generated for you. Do not copy `.env.example` or edit `.env` by hand: shared settings live in `.env.deloitte`, and secrets live in `.secrets/`.

### 1. Get the shared secrets

Ask another team member for the `.shared-secrets` file and save it as `.secrets/.shared-secrets`. Make sure it has the same length as the example file (one `KEY=value` line per key in `.secrets/.shared-secrets.example`, with no empty values):

```zsh
wc -l .secrets/.shared-secrets .secrets/.shared-secrets.example
```

Both files should report the same number of lines. The script stops and lists any missing secrets if they don't match.

`.shared-secrets` contains private key material. Do not commit it (it is gitignored), paste it into tickets, or share it in chat.

You do not need to create `.secrets/.personal-secrets`: the script creates it for you and fills in your token.

### 2. Fetch your LLM Gateway Token

- **Get an LLM Gateway token.** The script needs your own token for the LLM Gateway. ⚠️ Tokens expire after ~8 hours; if models suddenly stop working, get a new one and re-run the script (see _Updating your JWT token_).
  1. Navigate to [here](https://login.microsoftonline.com/36da45f1-dd2c-4d1f-af13-5abe46b99921/oauth2/v2.0/authorize?client_id=498ce9fd-195b-40c5-82f1-8fc4a6d00d88&response_type=id_token&redirect_uri=https%3A%2F%2Fjwt.ms&scope=openid%20profile%20email%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read&response_mode=fragment&state=random_state&nonce=random_nonce)
  2. Copy the whole token value.

### 3. Open Docker Desktop 

Open the Docker Desktop app.

### 4. Run the quickstart script with `--first-build`

```zsh
./quickstart.sh --first-build
```

The script prompts you to paste your token (the input is hidden, so nothing appears as you paste), then:

1. Saves your token to `.secrets/.personal-secrets`
2. Creates `.env` from `.env.deloitte` and fills in your secrets
3. Sets `DOMAIN_CLIENT`, `DOMAIN_SERVER`, `ADMIN_PANEL_URL` and `VITE_API_BASE_URL` from your hostname, and creates your `Caddyfile`
4. Builds the images (`docker compose build`) and starts all containers

⏱️ The first build compiles the whole repo and **may take ~10 minutes**. When it finishes, the script prints the link to open (for example `https://AU-ABC123123.local`).

## Updating your JWT token

When your token expires, get a new one (see step 2 above), then run the script again without `--first-build`:

```zsh
./quickstart.sh
```

This updates the token in `.secrets/.personal-secrets`, regenerates `.env`, and force-recreates the `api` container (the other containers are started if they are stopped). It does not rebuild images; when you have pulled new code or packages, run the build commands it prints at the end (separate commands for `api`, and for `admin-panel` and `rag_api`, each with and without cache). The token is entered at a hidden prompt, so it doesn't end up in your shell history. (Passing it as an argument, `./quickstart.sh <token>`, still works for non-interactive use but is not recommended.)

# `librechat.yaml` file

LibreChat configuration includes:

- Custom Azure AU / US endpoints
- VertexAI models
- Anthropic models via the gateway proxy
- Default visible models in the UI
- ClearTrack MCP integration
- And more!
- 
The librechat.yaml is a single source of truth for local and online deployments:

1. `librechat.yaml` (repo root)
   - Used by local Docker runs.
   - Gateway endpoints opt into `{{LIBRECHAT_LLM_GATEWAY_ID_TOKEN}}`, which resolves each signed-in user's current OpenID ID token. OpenID users with a missing or expired ID token must re-authenticate; `LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION` is only the local non-OIDC fallback, and the header is omitted when neither identity is available.

2. `charts/config/librechat.yaml` (symlink)
   - Points to the root file to keep local and deployment config in sync.
   - During `build-and-promote`, CI materializes a deployment copy by:
     - retaining every gateway `x-id-token` placeholder for request-time user-token resolution, and
     - ensuring `fileStrategy: "azure_blob"` is present for Kubernetes.
   - In deployed environments, `llm-gateway-proxy` forwards the resolved `x-id-token` and injects `x-sa-token` using the pod service account token. Gateway token-limit responses, including their status and JSON body, are passed through to the application.

## Models

Australian regional models are accessed through the Bedrock endpoint. Use an Australian regional model when the workload must remain in Australia.


---

# Docker Compose Setup

This local setup uses Docker Compose with two configuration files:

### `docker-compose.yml` (Base)

- Defines all services: LibreChat API, MongoDB, Meilisearch, VectorDB, RAG API
- References pre-built images by default (not modified directly per project convention)

### `docker-compose.override.yml` (Local Customizations)

- **Automatically merged** with the base file when running `docker compose` commands
- Overrides the base configuration to build LibreChat and RAG API from **local source code**
- Adds local-specific services: Caddy (reverse proxy), gateway-proxy (nginx)

# 🚀 Running the app

## Start services

### First time

Follow the [Quickstart](#5-quickstart). It generates your `.env` and `Caddyfile`, builds all images and starts every container (~10 minutes for the initial build):

```zsh
./quickstart.sh --first-build
```

### For all other times

Start the containers (this does not rebuild images):

```zsh
docker compose up -d
```

Or re-run `./quickstart.sh` to refresh your token and force-recreate the `api` container.

Docker Compose will:

1. Build LibreChat from your local source code
2. Build RAG API from the `rag_api` submodule
3. Pull supporting images (MongoDB, Meilisearch, etc.)
4. Start all containers

## When to rebuild

You need to rebuild images when you change:

- **Source code** in `/api`, `/client`, `/packages`, or `rag_api/`
- **Dependencies** (`package.json`, `requirements.txt`, etc.)
- **Dockerfiles** (`Dockerfile`, `rag_api/Dockerfile.lite`, etc.)

### Rebuild commands

Rebuild only the service you changed. Use the **with cache** command for code changes (unchanged layers are reused), and the **without cache** command for dependency changes or when a cached build looks stale. The `api` build is the slowest: it compiles `packages/*`, the client and the API.

| Service       | Changed                                    | With cache (fastest)                                                                    | Without cache (package changes, or stale build)                                                    |
| ------------- | ------------------------------------------ |-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `api`         | `/api`, `/client`, `/packages`, Dockerfile | `docker compose build api && docker compose up -d --force-recreate api`                 | `docker compose build --no-cache api && docker compose up -d --force-recreate api`                 |
| `admin-panel` | `admin_panel/` submodule                   | `docker compose build admin-panel && docker compose up -d --force-recreate admin-panel` | `docker compose build --no-cache admin-panel && docker compose up -d --force-recreate admin-panel` |
| `rag_api`     | `rag_api/` submodule                       | `docker compose build rag_api && docker compose up -d --force-recreate rag_api`         | `docker compose build --no-cache rag_api && docker compose up -d --force-recreate rag_api`         |

`./quickstart.sh` prints these same commands at the end of every run.

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

Ensure that `OPENID_CLIENT_SECRET` is populated in `.secrets/.shared-secrets` (ask a team member if you don't have it), then re-run `./quickstart.sh` so it is copied into `.env`. `OPENID_ISSUER` and `OPENID_CLIENT_ID` come from `.env.deloitte`.

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
- Get a new token and re-run `./quickstart.sh` (see _Updating your JWT token_)
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
