# kuboon-remix-utils

`@kuboon`-scoped utility packages for [remix](https://github.com/remix-run/remix), published to [JSR](https://jsr.io/@kuboon).

This is a [Deno workspace](https://docs.deno.com/runtime/fundamentals/workspaces/). Each package lives under `packages/` with its own `deno.json`.

## Packages

| Package                                                         | JSR                                                                                             | Description                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`data-table-sqlite-turso`](./packages/data-table-sqlite-turso) | [`@kuboon/remix-data-table-sqlite-turso`](https://jsr.io/@kuboon/remix-data-table-sqlite-turso) | Async Turso / libSQL adapter for `@remix-run/data-table`    |
| [`ssg`](./packages/ssg)                                         | [`@kuboon/remix-ssg`](https://jsr.io/@kuboon/remix-ssg)                                         | Static site generation (prerender) for `remix/fetch-router` |

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
