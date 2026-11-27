# Customer behavior checks — 27 November 2026

Scoped evidence, not a promise that every attack/error is impossible. All database mutations used fictional localhost `_test` identities. No production messages were sent.

| Scenario | Evidence / remaining acceptance |
|---|---|
| Back during checkout | Browser back/forward retains cart; navigation alone submits nothing |
| Signup tapped twice | Existing challenge/session regression; browser signup verified; repeat rapid taps on physical Android |
| Blank email | Email is not required by phone-first signup |
| Space password | Four-digit customer PIN, strict numeric validators; no password-login migration |
| Emoji in name | Unicode remains data; XSS-style order text renders as text; no ASCII-only identity assumption |
| Apple Hide My Email | N/A: Apple Sign In is not implemented/advertised |
| Quit onboarding halfway | Challenge/expiry/error regression; physical process-death replay still required |
| Deny permissions | Browser GPS denial falls back to pincode; human tester must handle real Android privacy prompts |
| Very long input | Bounded search, request bodies and server fields; no customer bio feature |
| Airplane mode mid-upload | Upload/request deadlines bounded; no new customer profile-upload journey; physical network-loss check remains |
| Slow data | Bounded requests/retries and one-order lost-response recovery; physical slow-data acceptance remains |
| Rotation | Landscape/fold-like browser reflow passes; native rotation/process lifecycle remains manual |
| Huge text | Root font32px home reflow passes; Android system font scale still required |
| Arabic device language | No Arabic translation promised; RTL/device acceptance required for that expansion |
| Dark preference | Tested readable branded theme; not a separate dark-theme feature |
| Timezone change | Money/quotes server-authoritative; India-calendar OTP ceilings tested; native time display review remains |
| Foldable | 540×720 and 844×390 emulated widths pass; no claim of physical/unreleased foldable testing |
| Two phones | Session/authorization regression; simultaneous physical login/logout acceptance remains |
| Delete then signup | Existing verified manual deletion policy retained; no instant-delete/recreate shortcut added; operational completion must be tested |
| Ban then signup | No invented device-ban feature or guarantee against all re-registration; follow actual account/phone policy |

Additional checks cover per-user order ownership, signed seller authority, cross-owner retry refusal, expired subscription, oversell races, expired holds, changed tax snapshots, immutable accepted HSN/GST, unknown cost, exact cash, balanced postings, eight-attempt exhaustion/manual retry, invalid address, quantity re-confirmation, history paging, 500-item atomic replacement and stable product IDs.

Automated axe found zero violations on 13 routes. Human keyboard, screen-reader, real-device touch and full translation review remain. Reel claims and an RLS setting alone are not evidence of a vulnerability or legal compliance; actual identity, credentials, network and application boundaries matter.
