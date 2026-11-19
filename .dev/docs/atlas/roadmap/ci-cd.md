# Roadmap: CI/CD

Jenkins is intended for continuous integration. Until it runs, the four root checks in [`DEVELOPMENT.md`](../../../../DEVELOPMENT.md#running-tests) run locally before every pull request.

## Continuous integration

A `Jenkinsfile` in this repository calls a new pipeline in `oicr-devops/jenkins-pipeline-library`, adapted from Arranger's `vars/pipelineOvertureArranger.groovy`. The library belongs to the `oicr-devops` organization, so its maintainers add the pipeline, and the Jenkins job for a repository under `oicr-softeng`.

| From Arranger's pipeline                                                           | In this repository's pipeline                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Kubernetes pod on `node:24`, `npm ci`                                              | Kept. `npm ci` needs the committed `package-lock.json`          |
| Turbo's change detection against `GIT_PREVIOUS_SUCCESSFUL_COMMIT`                  | Kept, which adds `turbo` and a `turbo.json` to this repository  |
| `turbo run build`, `turbo run test`                                                | Kept, with `typecheck` and `lint` added                         |
| Elasticsearch and Docker-in-Docker containers, image builds, image and npm publish | Dropped, since nothing here is published or built into an image |

Once the Jenkins check reports, it becomes a required check on `main`.

## Releases for macOS

How release builds are made is open. Whatever makes them has to:

- run on macOS, since Forge makes a DMG only there, and `@electron/osx-sign` signs with Apple's `codesign`
- sign with a Developer ID Application certificate, and notarize through `packagerConfig.osxNotarize` in `apps/desktop/forge.config.mts`
- publish the ZIPs that `update-electron-app` reads

Who holds the signing key and where updates are hosted are question 7 in the [MCP host plan](../../mcp-host/mcp-host-plan.md#5-open-questions)'s open questions. Its recommendation signs through a hardware-backed signing service, never with a key on a build machine.

One possible way is a release pipeline on a macOS Jenkins agent, beside the continuous integration pipeline. On 2026-11-16, every pipeline in the library ran in Linux pods, so this would need the library's first macOS agent.

The certificate needs an Apple Developer ID enrolment first: see [release prerequisites](release-prerequisites.md).
