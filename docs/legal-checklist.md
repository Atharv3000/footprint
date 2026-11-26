# Launch legal checklist (Nov 2026)

Checked against six common risks for AI-built apps. **Not legal advice**: talk to a lawyer about your situation.

| # | Risk | Status in Footprint | What was done / what is left |
| --- | --- | --- | --- |
| 1 | No age check at sign-up (COPPA, US: children under 13) | **Basic check in place** | Setup's "Your physiology" step has a required "I confirm I'm 13 or older" checkbox (`app/onboarding.tsx`, `constants/ageConfirmation.ts`); Continue stays disabled until it is ticked, and the confirmation time is stored on the device. Terms and Privacy Policy say the app is not for children under 13. Note: the FTC prefers a *neutral* question (asking for a birth date without hinting at the cut-off) over a yes/no checkbox; consider switching before a wide launch, especially as the app handles body photos. |
| 2 | Google Fonts loaded from Google's servers (GDPR) | **Fixed (website)** | The app already bundles its fonts. The website (`footprint-site.zip`) loaded them from `fonts.googleapis.com`; it now self-hosts the same fonts (`fonts/`, `fonts.css`, SIL OFL licences included). Verified: 0 requests to other servers. |
| 3 | Session replay on by default (CIPA, California) | **Not applicable** | No analytics or session-replay SDK is installed. If you add one (PostHog, Sentry Replay, LogRocket…), keep replay off or ask consent first and mask inputs. |
| 4 | Marketing email without unsubscribe link / postal address (CAN-SPAM) | **Not applicable yet** | The app sends no marketing email (Supabase sign-in emails are transactional). When you send a launch/newsletter email, include an unsubscribe link and a postal address in every one. |
| 5 | Subscription checkout without renewal terms by the button (California auto-renewal law) | **Not applicable yet** | No payments or subscriptions in the app. When you add one, show price, billing period and "renews automatically until cancelled; cancel any time in Settings" right next to the subscribe button, and make cancelling as easy as subscribing. |
| 6 | No registered DMCA agent (lose safe harbour for user uploads) | **Needs you** | Users can upload profile photos others can see. The Terms now have a full DMCA section with a placeholder for the agent. **You must:** register at https://dmca.copyright.gov (US Copyright Office DMCA Designated Agent Directory; $6, renew every 3 years), then replace `[AGENT NAME], [MAILING ADDRESS], [PHONE], [EMAIL]` in `terms.html` (inside `footprint-site.zip`). |

Also worth knowing: the Terms list a personal university email and address as the contact. Consider a dedicated business email and mailing address (or a P.O. box / virtual address) before launch, since the DMCA agent entry and CAN-SPAM footer are public.
