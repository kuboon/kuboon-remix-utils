# kuboon-remix-utils

`@kuboon`-scoped utility packages for [remix](https://github.com/remix-run/remix), published to [JSR](https://jsr.io/@kuboon).

This is a [Deno workspace](https://docs.deno.com/runtime/fundamentals/workspaces/). Each package lives under `packages/` with its own `deno.json`.

## Packages

| Package                                                         | JSR                                                                                             | Description                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`assets-deno`](./packages/assets-deno)                         | [`@kuboon/remix-assets-deno`](https://jsr.io/@kuboon/remix-assets-deno)                         | JSR-capable on-demand asset server for `remix/fetch-router`                                          |
| [`data-table-sqlite-turso`](./packages/data-table-sqlite-turso) | [`@kuboon/remix-data-table-sqlite-turso`](https://jsr.io/@kuboon/remix-data-table-sqlite-turso) | Async Turso / libSQL database for `@remix-run/data-table`, with a migration CLI replacing `remix db` |
| [`mcp`](./packages/mcp)                                         | [`@kuboon/remix-mcp`](https://jsr.io/@kuboon/remix-mcp)                                         | Serve an MCP server from a `remix/fetch-router` route                                                |
| [`onboarding-kit`](./packages/onboarding-kit)                   | [`@kuboon/remix-onboarding-kit`](https://jsr.io/@kuboon/remix-onboarding-kit)                   | JSON-defined product tours (spotlight walkthroughs) for `@remix-run/ui`                              |
| [`ssg`](./packages/ssg)                                         | [`@kuboon/remix-ssg`](https://jsr.io/@kuboon/remix-ssg)                                         | Static site generation (prerender) for `remix/fetch-router`                                          |

## Claude Code plugins

`plugins/` holds Claude Code plugins whose skills document these packages, kept
next to the implementation they describe rather than in a separate skills repo.
[`kuboon/agent-plugins`](https://github.com/kuboon/agent-plugins) lists them in
its marketplace with a `git-subdir` source pointing back here, so a skill and the
package it documents change in the same commit.

| Plugin                                                           | Skill                                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`remix-db-migrations-deno`](./plugins/remix-db-migrations-deno) | Running `@remix-run/data-table` migrations from Deno — `remix db` for sqlite/postgres/mysql, and this repo's `@kuboon/remix-data-table-sqlite-turso` CLI for Turso / libSQL |

```sh
claude plugin marketplace add kuboon/agent-plugins
claude plugin install remix-db-migrations-deno@agent-plugins
```

## Development

```sh
deno task check   # type check every package
deno task test    # run all tests
deno fmt          # format
deno lint         # lint
```

## Releasing

Publishing to JSR is automated. When a package's source changes on `main`,
`.github/workflows/release-jsr.yaml` calls the shared reusable workflow
[`kuboon/workflows/.github/workflows/release-jsr.yml`](https://github.com/kuboon/workflows/blob/main/.github/workflows/release-jsr.yml),
which runs `deno publish` (OIDC, no token) and pushes a `name@version` git tag.
It skips the publish when the tag already exists, so bump the `version` in the
package's `deno.json` to cut a release.

> [!NOTE]
> Each JSR package must be linked to this repository at
> `https://jsr.io/<package>/publish` for OIDC publishing to succeed.
