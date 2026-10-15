# Release, signing and updates

Migrated 2026-10-13 from the root README "Release setup" and the release paragraphs of the root STATUS.md. Planned/blocked release work is in the [roadmap](../planning/roadmap.md#later-platform-validation-and-release-backlog). Installers are built only for major releases or on explicit request ([AGENTS.md](../../AGENTS.md)).

## Release setup

Default release host: GitHub Releases, with a static updater manifest at `https://github.com/<owner>/<release-repository>/releases/latest/download/latest.json`. This follows the [Tauri updater hosting format](https://v2.tauri.app/plugin/updater/). The source repository is now [NicolasCapparelli/archiver](https://github.com/NicolasCapparelli/archiver) (initial push 2026-10-14). A release feed has not been published or configured, so this template is not embedded as a working endpoint. Development installers stay unsigned; trusted Windows code signing remains a public-release prerequisite. Updater artifacts will use a separate locally held signing key, with only its public verification key embedded in the app.

Launch at sign-in is an explicit Settings toggle. Update checks are manual, with a separate install action. A release must embed an HTTPS feed and public updater key. Supply a Windows certificate thumbprint to tools/release.ps1, plus -UpdateEndpoint and -UpdatePublicKey; keep TAURI_SIGNING_PRIVATE_KEY local and never commit it. Windows code signing and updater artifact signing are distinct. The script creates artifacts without publishing them. Without embedded feed/key, Settings explains updates are unconfigured. The review installer is unsigned. Signing credentials, public hosting, and real installer/update tests remain release prerequisites.

## Release status as of 2026-10-12


Release default chosen: GitHub Releases for installers and the static latest.json feed. No release repository is connected yet. Local development installers remain unsigned; trusted Windows code signing is required before a public release, and updater signatures use a separate private key kept outside the repository.


The local unsigned installer is built in `target/release/bundle/nsis`. It has not been installed or published. (Dated claim from the 2026-10-12 STATUS.md; installer artifacts have not been touched since, per later entries.)
