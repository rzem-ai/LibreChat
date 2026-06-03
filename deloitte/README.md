# LibreChat – Local Setup (MyAssist 2.0)

This repository contains the local development setup for **LibreChat**, configured to work with Deloitte’s **ClearTrack LLM Gateway** and internal model endpoints. This setup is intended to support development and experimentation for **MyAssist 2.0**.

---

## What this setup gives you

- A **local LibreChat instance** running via Docker
- Support for **Azure OpenAI (AU & US)**, **VertexAI**, and **Anthropic via gateway proxy**
- Integration with **ClearTrack MCP Gateway**
- Local theming via **Deloitte GEL assets**
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

## 2. Set up Caddyfile

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
5. To check your hostname is accessible on your machine, run `ping yourhostname.local` (e.g. `ping AU-ABC123123.local`). If you get "unknown hostname", continue to *If you cannot ping your hostname*. If your ping returns responses (even timeout responses), continue to *3. Environment configuration*.

### If you cannot ping your hostname
1. Enable privileges on your machine
2. Run `sudo nano /etc/hosts`
3. Use the down arrow to navigate to bottom of hostfile
4. Type: `127.0.0.1 yourhostname.local` (e.g. `127.0.0.1 AU-ABC123123.local`) to add your hostname to the hostfile
5. 'Ctrl-O' to writeout/save
6. 'Enter' to continue
7. 'Ctrl-X' to close
8. Try `ping yourhostname.local` again


## 3. Environment configuration (.env)

Start by copying the example file:

```zsh
cp .env.example .env
```

### Make changes 

Update the existing keys below in `.env` (edit the existing entries, do not add new keys unless they don't exist yet):

Tip: ask your AI coding assistant to create (for new) or update (for existing) .env values.

1. `ENDPOINTS=anthropic,custom,agents`
2. `ANTHROPIC_REVERSE_PROXY=http://gateway-proxy:8080/anthropic`
3. `APP_TITLE=MyAssist 2.0`
4. `DOMAIN_CLIENT=https://<yourhostname>.local` (for example `https://AU-ABC123123.local`)
5. `DOMAIN_SERVER=https://<yourhostname>.local` (for example `https://AU-ABC123123.local`)
6. `ALLOW_SOCIAL_LOGIN=true`
7. `OPENID_CLIENT_ID=<update with the provided value from another team member>`
8. `OPENID_CLIENT_SECRET=<update with the provided secret from another team member>`
9. `OPENID_ISSUER=<update with the provided issuer URL from another team member>`
10. `OPENID_SESSION_SECRET=<update with the provided secret from another team member>`
11. `OPENID_SCOPE="openid profile email"`
12. `OPENID_CALLBACK_URL=/oauth/openid/callback`
13. `OPENID_REQUIRED_ROLE=`
14. `OPENID_REQUIRED_ROLE_TOKEN_KIND=id`
15. `OPENID_BUTTON_LABEL="Login with SSO"`
16. `OPENID_IMAGE_URL=/assets/favicon.svg`
17. `ALLOW_EMAIL_LOGIN=false`
18. `ALLOW_REGISTRATION=false`
19. `ALLOW_SOCIAL_REGISTRATION=false`
20. Comment out `OPENAI_API_KEY=`
21. Comment out `ASSISTANTS_API_KEY=`
22. BASE_URL_AZURE_AU=https://au-openai-exp.ctk.au.deloitte.com/openai/v1
23. BASE_URL_AZURE_US=https://us-openai-exp.ctk.au.deloitte.com/openai/v1
24. BASE_URL_VERTEXAI=https://us-vertexai-exp.ctk.au.deloitte.com
25. `LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION="<YOUR_ID_TOKEN>"`

#### How to obtain the JWT token
⚠️ As of May 2026, tokens expire after ~8 hours. If models suddenly stop working, reissue the token.
1. Navigate to [here](https://login.microsoftonline.com/36da45f1-dd2c-4d1f-af13-5abe46b99921/oauth2/v2.0/authorize?client_id=498ce9fd-195b-40c5-82f1-8fc4a6d00d88&response_type=id_token&redirect_uri=https%3A%2F%2Fjwt.ms&scope=openid%20profile%20email%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read&response_mode=fragment&state=random_state&nonce=random_nonce)
2. Copy the whole value to LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION inside quotation marks

---

## `librechat.yaml` files

LibreChat configuration includes:

- Custom Azure AU / US endpoints
- VertexAI models
- Anthropic models via the gateway proxy
- Default visible models in the UI
- ClearTrack MCP integration
- And more!

There are now **two** `librechat.yaml` files on purpose:

1. `librechat.yaml` (repo root) - **local development config**
   - Used by local Docker runs.
   - Sends `x-id-token` headers for custom endpoints using `LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION` from `.env`.

2. `charts/config/librechat.yaml` - **Kubernetes/Helm deploy config**
   - Packaged into the chart ConfigMap for DEV/UAT/PROD deployments.
   - Does **not** send `x-id-token` for custom model calls.
   - In deployed environments, auth is injected by `llm-gateway-proxy` as `x-sa-token` using the pod service account token.

Why this split exists:
- Local and deployed auth mechanisms are different (`x-id-token` locally vs `x-sa-token` in Kubernetes).

# 🚀 Running the app

## Start services

```zsh
docker compose up -d
```

If things behave oddly, try a clean restart:

```zsh
docker compose down
docker compose up -d
```

## Access the app

Open your configured `DOMAIN_CLIENT` URL in **Safari** or via LocalHost in Chrome.

---

## VPN gotcha

You may need to **swap VPN state** during setup:

- Pull Docker images → ❌ VPN Off  
- Running models via gateway → ✅ VPN On  

If models fail with gateway or MCP errors, this is almost always the cause.

---

## Common fixes

### Docker image pull hangs or fails

`unset https_proxy`  
`unset http_proxy`

Manual pulls if needed:

`docker pull mongo:8.0.21`  
`docker pull registry.librechat.ai/danny-avila/librechat-dev:latest`

### MongoDB version error

If you see `featureCompatibilityVersion` errors:

`docker rmi mongo:8.0.20`

### No model responses

- Refresh the browser
- Start a new chat
- Check token expiry
- Confirm VPN is **on**

---

## Notes on deployment

- The intent is to later host this via **ClearTrack**
- ClearTrack provides shared dev / stage / prod URLs
- A lightweight fork approach is preferred:
  - Track latest LibreChat releases
  - Keep Deloitte changes minimal and config-only

---

# 🟢 Deloitte App Reg

Deloitte App Reg is used to manage the Azure Entra authentication for this app. 

For LOCAL development, we need to add each user's hostname to the Redirect URIs list in the "Authentication" tab of the App Registration. This is required because Deloitte's Azure Entra does not allow `localhost` in Redirect URIs, so we use a custom domain (e.g. `AU-ABC123123.local`) for local development instead.

### Details Per Environment
- **DEV (Inc. LOCAL):** [AU CTK_TT_Librechat NONPROD](https://appreg.iam.deloitteresources.com/AppProperties/2075976d-5147-47b2-89d2-4ad060d19f85)
- **UAT:** TBC
- **PROD:** TBC

### Configuration
- Setup Method: WebAPI/OIDC
- Authentication Tab: Configured Identifier URI and Redirect URIs
- Secrets Tab: Generated a client secret, used for local `.env` configuration and, where applicable, the relevant Helm `values*.yaml` under `charts/`
- Users and Groups: Currently just linked to the MyAssist DEV user group (AU_App_MyGenAI_Dev, request access [here](https://deloitteapac.service-now.com/mysupport?id=sc_cat_item&sys_id=a3c4ad4e332c9e146a61cad24d5c7bcb))

# 🔐 Security

Security reviews are performed by **PrismaScan** and **Checkmarx**. You'll see high level results within the PR comments.

For more detail, reach out to Ben Kwan and request to be added to the *tt-librechat* project, then see the results at [Checkmarx](https://anz.ast.checkmarx.net/). Note, Checkmarx is buggy in Safari, so use Chrome instead.

# 🔢 Database Connection in VS Code

You can connect to the MongoDB in VS Code, to see dev/uat/prod data. 

## MongoDB
See instructions [here](https://github.com/Deloitte-Australia/dep-infrastructure/wiki/Connecting-to-MongoDB-Atlas)
