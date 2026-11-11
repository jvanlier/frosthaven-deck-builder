# Catalogs and artwork

Character catalogs and all runtime artwork are committed locally. They come from
a pinned revision of
[cmlenius/gloomhaven-card-browser](https://github.com/cmlenius/gloomhaven-card-browser),
so normal app use has no external asset dependency.

The importer validates each complete class catalog before downloading assets. It
writes the catalog, card back, class icon, and source manifest transactionally.
`src/shared/data/characters/*-source-manifest.json` records upstream revisions
and SHA-256 checksums for the committed files.

Blinkblade cards retain both printed initiatives. Each class uses its own hand
size, including Hive's 9-card hand and Geminate's 14-card hand. Mercenary Pack
classes have their own catalogs, icons, and card backs.

For regeneration steps, see [refresh catalogs and artwork](refresh-catalogs.md).
For artwork ownership and terms, see [attribution](../README.md#attribution).
