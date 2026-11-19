# Account data and empty histories

New email/Apple/Google sign-ins load a profile for that normalized email, or a fresh profile with unconfirmed measurements (zero), current join month and setup incomplete. Email sessions use the email provider, so they survive restarts. Sign-out archives the account profile and resets the active session. Profile updates save before changing UI state. Tabs remount per account and stay hidden until setup finishes.

History readers no longer generate walks, sets, body-fat values, weigh-ins or progress photos. They reject foreign-owner records and known legacy sample IDs for ordinary users; the explicit Alex Mercer demo retains its examples. Empty workout plans return an empty list. Step seeding is restricted to that explicit demo. Badges use real totals and consecutive dates with no minimum rewards or invented earned dates. These filters retain original stored history.

Legacy generated step history has no source tags. When the old seeding flag exists, the original map is backed up to @footprint_step_seed_repaired_v1_<account>_backup, then rebuilt from genuine saved walks. A per-account marker makes this repair idempotent. Accounts without the flag are untouched.

Nutrition targets, quiz, meals and water use account-specific keys. Legacy shared values are copied once to the recorded legacy profile owner, never to a different new sign-up; originals remain intact. Old shared data predates ownership tracking and cannot be reliably split if several accounts used it. Previously inherited biometric fields cannot be reliably attributed retroactively; users should review their profile measurements. No existing real history or credentials are erased.

This change preserves the app's existing device-local email credential implementation; it does not introduce hosted authentication or cross-device sync. Apple identity still follows the existing email-based keying.

Run node scripts/test-account-isolation.cjs and node scripts/test-onboarding.cjs. On-device checks: create account A, complete setup, save a real meal/workout, sign out, create B and verify empty history/no streak, then sign back into A and restart the app. Account -> three dots -> Preview tutorial starts a manual three-step tour without resetting data or onboarding completion.
