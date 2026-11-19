# Roadmap: release prerequisites

Builds of `apps/desktop` are for development only until the app has its final product name, its bundle ID and a Developer ID to sign with. The first two are hard to change once a build is installed. The third has lead time of its own.

## Product name and bundle ID

`apps/desktop/package.json` sets `productName` to "Conversational Research Environment", an interim name. `apps/desktop/forge.config.mts` sets no `packagerConfig.appBundleId`, so the packager picks a default.

Both reach past the app's own folder:

- **Electron names the `userData` directory after the product name.** The [MCP host plan](../../mcp-host/mcp-host-plan.md#24-cre-main-process)'s §2.4 keeps notebooks and state there, so a changed product name leaves an installed build's notebooks under the old name.
- **`safeStorage` names its keychain item after it too**, as "Conversational Research Environment Safe Storage", so tokens stay under the old name as well.
- **Squirrel.Mac applies an update only if it satisfies the running app's designated requirement**, which includes the bundle ID. A changed bundle ID stops earlier builds from updating.

## Developer ID

Builds are signed ad-hoc, with `apps/desktop/entitlements/ad-hoc.plist`. A release needs Apple's Developer ID Application certificate and notarization. The enrolment takes time of its own, which puts it on the first release's critical path, ahead of whatever makes [release builds](ci-cd.md#releases-for-macos).

A Developer ID build replaces the signing identity `-` in `forge.config.mts` with the certificate's identity. It then signs with `entitlements/developer-id.plist`, which holds `allow-jit` alone, without the ad-hoc build's `disable-library-validation`.
