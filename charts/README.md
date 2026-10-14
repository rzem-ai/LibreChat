## 📦 Helm Chart

This Helm chart deploys to a Kubernetes cluster via ArgoCD. It supports different configurations for development, UAT and production environments.

### 🏗️ Configuration

The Helm chart uses three values files:
- **`values.yaml`** - the parent template values file
- **`values-prd.yaml`** - for production deployments
- **`values-uat.yaml`** - for UAT deployments
- **`values-dev.yaml`** - for development deployments

### Model availability

`ANTHROPIC_MODELS` and `BEDROCK_AWS_MODELS` define the models provisioned for each deployment environment. Claude Haiku 5.5, Claude Sonnet 5.5, and Claude Opus 5.5 are currently enabled only in CTNP/development; do not add them to UAT or production until the LLM Gateway provisions them there.

### 📋 Example Usage

#### Install External Secrets operator locally:
Please run the below command if you wish to install the Helm Charts locally
```bash
helm repo add external-secrets https://charts.external-secrets.io

helm install external-secrets \
   external-secrets/external-secrets \
    -n external-secrets \
    --create-namespace \
    --set installCRDs=true
```

#### To test helm charts locally without installing:
```bash
helm install charts ./charts --dry-run --debug -f ./charts/values.yaml -f ./charts/values-dev.yaml
```

#### To install or upgrade the Helm chart:

**Development Environment**

```bash
helm upgrade --install charts ./charts --values ./charts/values.yaml  --values ./charts/values-dev.yaml --namespace my-namespace
```

**Production Environment**

```bash
helm upgrade --install charts ./charts --values ./charts/values.yaml --values ./charts/values-prd.yaml --namespace my-namespace
```

### ⚙️ Continuous Deployment with ArgoCD

ArgoCD monitors the following files for automatic deployment:
- values-dev.yaml - monitored on the develop branch for GitFlow, or main branch for Trunk.
- values-uat.yaml - monitored on the uat branch for GitFlow, or main branch for Trunk.
- values-prd.yaml - monitored on the main branch for GitFlow, or main branch for Trunk.
- values.yaml - the parent template values file

Ensure that changes to these files are committed to their respective branches to trigger deployments.
