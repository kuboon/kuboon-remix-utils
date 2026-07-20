# `data-table-sqlite-turso` CHANGELOG

This is the changelog for [`data-table-sqlite-turso`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/data-table-sqlite-turso). It follows [semantic versioning](https://semver.org/).

## 0.1.0

- Moved into the `kuboon-remix-utils` repository and switched to a Deno-native package (`deno.json`) published to JSR via the shared `kuboon/workflows` release workflow.
- Annotated `TursoDatabaseAdapter#capabilities` with an explicit `AdapterCapabilities` type so the package publishes with fast types (no `--allow-slow-types`).

## 0.0.0

- Initial release of `@kuboon/remix-data-table-sqlite-turso`, an asynchronous Turso / libSQL adapter for `remix/data-table`, published to JSR.
