# Refresh catalogs and artwork

Complete the [development setup](setup.md), then run from the repository root:

```sh
just import-cards
```

This regenerates character catalogs and runtime artwork from the pinned upstream
source. Review the generated catalogs, assets, and
`src/shared/data/characters/*-source-manifest.json` files, then run the
[development checks](development.md#verify-a-change).

Keep runtime assets local; do not add an external runtime asset dependency.
See [catalogs and artwork](catalogs.md) for import behavior and provenance.
