# Publish the prebuilt Netlify artifact

Release run 42938409839 attempt 2 passed CI evidence, protected preflight, the
web-only build and artifact preparation. Publish stopped with
ENGINEERING_RELEASE_UPLOAD_REQUIRES_INSPECTION. Netlify deploy history showed
production still serving db4ecd5 (deploy 6af2ed7786e578c4e837f0a9) with no new
deploy entry from this attempt.

Netlify CLI 27.16.2 rejects the combination of --context production and
--no-build before it creates a deployment. The context flag applies to the CLI's
build. Use --prod --no-build to submit an already built artifact for production.
Netlify supplies runtime environment values to the functions in that production
deploy. Apply the same correction to engineering publish, standard production
release and rollback, which shared the incompatible flags.

The publisher still requires exact-main CI, a reviewed production environment,
credential isolation, artifact and function-source digests, rollback evidence,
production deploy identity, hosted file verification and health checks. Upload
failure output includes a fixed phase, bounded exit status and timeout flag. Raw
CLI output remains private because it can contain credential-bearing diagnostics.

With the pinned CLI and a loopback Netlify API fixture, the old command rejected
the flags without sending a deploy request. The corrected command created a
production request (draft=false), submitted a manifest for 153 web files, 25
functions and five schedules, and returned the expected JSON receipt. The fixture
requested zero file transfers because it models an API that already has every
hash. Production publication still requires the protected run after merge.

Local validation passed all 1,825 tests, including 54 focused publisher/security
checks, plus typecheck, lint, production builds, mobile build and Android sync.

The next release uploaded successfully, then stopped at hosted verification and
restored the previous deployment. The [hosted verification investigation](hosted-artifact-verification-2026-11-11.md)
records the complete byte comparison, the limits of the original diagnostics and
the follow-up correction. Successful CLI upload alone does not complete release.
