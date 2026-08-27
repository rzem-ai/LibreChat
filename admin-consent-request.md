## Request: Grant admin consent for LibreChat → AI Registry OBO scope

**Requested by:** alwaseem@deloitte.com.au
**Tenant:** 36da45f1-dd2c-4d1f-af13-5abe46b99921
**Priority:** Blocks skill-upload scanning from using per-user (OBO) tokens — currently falls back to a static shared bearer token, or fails scans outright once that token expires.

### What's needed

Grant admin consent for the LibreChat client app to call the AI Registry app on behalf of signed-in users (OAuth2 On-Behalf-Of flow), for the `access_as_user` delegated scope.

| Item | Value |
|---|---|
| Client app (requesting) | `AU CTK_TT_Librechat NONPROD` |
| Client app ID | `2075976d-5147-47b2-89d2-4ad060d19f85` |
| Client service principal (object ID) | `ca232e73-7617-4f06-b297-8578bcedf25e` |
| Resource app (API being called) | `AU AI Registry NONPROD` |
| Resource app ID | `4aeebbdc-56f5-4329-b40e-3d0a243bf74a` |
| Resource service principal (object ID) | `b07198f2-885f-47b6-9164-58e4a8cdaa70` |
| Scope requested | `access_as_user` (scope ID `887abdc1-3aff-49ab-bf0d-affccfc04398`) |
| Consent type required | **Admin** (scope is configured `adminConsentRequired: Admin` — users cannot self-consent) |

### Confirmed current state (read-only check, 2026-08-27)

Queried `oauth2PermissionGrants` filtered on the LibreChat client service principal — the only existing grant is to Microsoft Graph (`User.ReadBasic.All email openid offline_access profile User.Read`). No grant exists yet from LibreChat → AI Registry for `access_as_user`. Attempting the OBO exchange today returns `AADSTS65001: The user or administrator has not consented`.

### Steps for whoever has Application Administrator / Cloud Application Administrator / Global Administrator

**Portal:**
1. Entra ID → App registrations → `AU CTK_TT_Librechat NONPROD` → API permissions
2. Add a permission → APIs my organization uses → `AU AI Registry NONPROD` → Delegated permissions → `access_as_user`
3. Click **Grant admin consent for <tenant>**

**Or via CLI (requires the roles above):**
```bash
az ad app permission add --id 2075976d-5147-47b2-89d2-4ad060d19f85 \
  --api 4aeebbdc-56f5-4329-b40e-3d0a243bf74a \
  --api-permissions 887abdc1-3aff-49ab-bf0d-affccfc04398=Scope

az ad app permission admin-consent --id 2075976d-5147-47b2-89d2-4ad060d19f85
```

### How to verify it worked

```bash
az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/oauth2PermissionGrants?\$filter=clientId eq 'ca232e73-7617-4f06-b297-8578bcedf25e'"
```
Should return an additional grant with `resourceId: b07198f2-885f-47b6-9164-58e4a8cdaa70` and `access_as_user` in `scope`.
