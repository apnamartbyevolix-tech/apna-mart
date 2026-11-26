# Customer PIN and public shop photos

Customers select **Create account**, verify a six-digit SMS OTP and choose/confirm a four-digit PIN. Returning customers use mobile number plus PIN. **Forgot PIN / set up PIN** requires a new OTP before changing the PIN; older mobile sessions are revoked. Existing OTP clients remain compatible. The reviewer demo remains separate and contains fictional records.

PINs are never stored or logged in plain text. The server combines the verified phone and PIN with the existing server-only `MTM_OTP_SECRET`, then uses random-salt scrypt. Five incorrect PIN guesses lock an identity for 15 minutes; persistent phone/IP limits also bound requests. Same-origin checks, HttpOnly cookies, session expiry and customer-only roles remain enforced. Keep `MTM_OTP_SECRET` stable; rotating it invalidates existing PIN verification as well as OTP digests, requiring OTP recovery.

Apply PostgreSQL migration `0002_customer_pin.sql` through the existing Drizzle migration command **before deploying the new server**. It adds nullable salt/digest fields and failure/lock metadata to existing phone identities; no users or orders are replaced. Legacy MySQL schema and additive migration `0012_customer_pin.sql` have matching columns. No new provider credentials are required.

## Photos

Owners upload the storefront photo in **Apna Galla → Business Details → Store Photo**. This is separate from the invoice logo. Item photos continue to use the existing item editor. Validated image uploads/removal mark an already-published shop catalogue for synchronization. Owners can use Retry/Refresh catalogue to refresh an older listing.

The existing authenticated, signed catalogue message accepts optional nullable `shop.imageUrl` and item `imageUrl`. A string must use `https://api.apnagalla.in/api/v1/retail/mytown/media/{publishingMerchantUuid}/{attachmentUuid}`. The Mart receiver rejects arbitrary hosts, another merchant, credentials, query strings and fragments. Null explicitly clears an image; omitted fields keep compatibility with older senders.

The public Galla image endpoint serves only the latest store image or a selected supported item's latest image, for a currently eligible LIVE shop. Private purchase/expense/payment documents, unpublished/unselected items, expired or paused shops and replaced photos remain inaccessible. Responses use validated image MIME, nosniff, cross-origin image permission and no-store. Existing storage credentials stay on the Galla backend.

Deploy the receiving Mart server first, then the Galla image/publishing server, then the Galla owner interface. On the Galla server update, previously consented live listings receive one catalogue refresh if their last acknowledged catalogue omitted the photo fields. Owners can also use an upload/change or explicit catalogue refresh. No customer account, phone, cost, private attachment URL or credential is included in the public catalogue.

## Cleanup and navigation

The five customer navigation links occupy five equal-width columns. The unused starter debug recorder/injection, Manus sign-in dialog, public OAuth branding and standalone component showcase are removed. Existing server OAuth compatibility is retained for existing protected accounts; removing that implementation would require a separate verified account migration.
