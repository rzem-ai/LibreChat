# Plan: move the research feature into `packages/researcher`

Working plan for `feat/research-agent`, 3 November 2026. Decisions taken: move everything
that can move, core calls the package through direct imports (no plugin layer), commits on
this branch.

## Target layering

```
librechat-data-provider      research contract that the base layer must own (see "Stays")
        ^
@librechat/data-schemas      core models; research models leave
        ^
@librechat/api               no research code left
        ^
@librechat/researcher        NEW: server module, models and methods, React panels and hooks
        ^
/api (CJS wiring), client    thin call sites importing @librechat/researcher
```

`@librechat/researcher` depends on data-provider, data-schemas, `@librechat/api`,
`@librechat/agents` and `@librechat/client`. Nothing below it may import it.

## Package shape

```
packages/researcher/
  package.json            name @librechat/researcher, exports "." (server) and "./client"
  tsdown.config.mjs       two entries, like packages/chat
  jest.config.*           node project for server, jsdom project for client
  src/
    server/               from packages/api/src/research (58 files, tests alongside)
    db/                   from packages/data-schemas: researchJob, researchSchedule, snapshot,
                          feed schemas + models + methods, with createResearchModels(mongoose)
                          and createResearchMethods(mongoose)
    client/
      panels/             from client/src/components/SidePanel/{Research,Feeds}
      hooks/              from client/src/data-provider/Research (incl. useResearchConversationSync)
      index.ts
    index.ts              server entry
```

## Stays in core, and why

| Piece | Stays in | Reason |
|---|---|---|
| `researchSchema` and `configSchema.research` | data-provider `config.ts` | Validates `librechat.yaml`; data-provider cannot depend upward |
| Research tool specs (`research/specs.ts`: names, descriptions, argument schemas) | moves to data-provider | `@librechat/api`'s tool registry reads them, and `@librechat/api` cannot depend on the package |
| `AppConfig.research` loading | data-schemas `app/service.ts` | Part of core config loading |
| Translation strings | `client/src/locales/en/translation.json` | Localisation is the app's; components use `useLocalize` from `@librechat/client` |
| Call sites | `/api` and `client` | The chosen seam: routes, `request.js` admission and settle, `v1.js` delete guard, `handleTools`/`ToolService`, server startup, model registration in `api/db`, nav links, `ChatView` sync call, `ScheduleDialog` filter, error registry, `DeleteButton` |
## Decision: the wire contract moves into the package

Alex chose to move the wire contract (job types, endpoints, query keys, data-service calls)
into the package. Only the config schema and the tool specs stay in data-provider. The package
builds its own data service on data-provider's request helper and defines its own query keys.
This departs from AGENTS.md's "shared endpoint definitions belong in data-provider" by the
maintainer's choice, so the package's README says so.

## Steps (one commit each, tests green at every commit)

1. Scaffold `packages/researcher` (package.json, tsconfig, tsdown, jest, root workspace and
   `build:researcher` in `build:packages` after `build:api`), empty entries, builds.
2. Move tool specs to data-provider; point `packages/api` tool registry at them.
3. Move the server module from `packages/api/src/research` to `src/server`; replace `~/`
   imports with `@librechat/api` exports; drop `export * from './research'` from
   `packages/api`; repoint `/api` requires to `@librechat/researcher`.
4. Move research schemas, models and methods out of data-schemas into `src/db`; register
   them from `api/db`; type research methods from the package rather than `AllMethods`.
5. Move the client panels and hooks to `src/client`; replace `~/hooks`, `~/data-provider`
   and `~/components/ui` imports; repoint the client call sites.
6. Move the wire contract (types, endpoints, keys, data service) from data-provider into the
   package; data-provider keeps `researchSchema`, the startup flag and the tool specs.
7. Update docs: design doc section 5.1 (where the code lives), the todo, AGENTS-style notes,
   `docs/howto/administration.md` paths and the README Known issues (most are fixed).

Verification per step: focused Jest in each touched workspace, `npx tsc --noEmit` in each,
`npm run build:packages`, and at the end a live check in the running app (send a job, open
both panels, create a schedule) plus `npm run static-checks -- --against origin/dev`.

## Risks

- Jest module mapping and `mongodb-memory-server` set-up must be recreated in the package.
- Vite and Jest in `client` resolve the package through `dist`, so the package must build
  before the client, like packages/chat.
- `request.js` and `handleTools.js` are large shared files; only their import lines change.
