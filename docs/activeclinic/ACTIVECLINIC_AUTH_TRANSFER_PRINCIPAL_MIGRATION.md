# ActiveClinic V6 — Auth-Transfer Principal Migration (AC-V6-07)

**Status:** Implemented (transitional)  
**Branch:** `V6`  
**Companion:** `ACTIVECLINIC_SESSION_PRINCIPAL_MIGRATION.md`

## 1. Legacy model

BlessBoard tenant handoff (`purpose = tenant_login`):

- Pending transfer: `user_id` null, `church_id` required
- Authenticated: `user_id` set (BlessBoard user)
- Redeem: consume once → `createV5Session` with `user_id`
- TTL ≤ 5 minutes; hash-only storage

## 2. Transitional model

| Path | Purpose | Principal | `church_id` |
|------|---------|-----------|-------------|
| BlessBoard | `tenant_login` | `user_id` | required (app logic) |
| ActiveClinic | `activeclinic_login` | `platform_identity_id` | null |

Pending transfers may still have **both** principals null until authenticated.

Invalid combinations for redeemable rows:

- No principal at redeem time
- Both principals set
- Wrong purpose for product/deployment

## 3. Database

Migration `022_session_auth_transfer_principals.sql`:

- `platform_identity_id` nullable FK → `platform.identities`
- `church_id` nullable (BB still requires it in service)
- purpose CHECK includes `activeclinic_login`
- indexes on identity / deployment+identity
- no backfill

## 4. Services

| Product | Module |
|---------|--------|
| BlessBoard (unchanged behavior) | `authTransferService.js` |
| ActiveClinic | `platformIdentityAuthTransferService.js` |

Repository (`authTransferRepository.js`) supports both authenticate/consume paths without changing BlessBoard purpose filters.

ActiveClinic flow:

1. `createActiveClinicLoginTransferRequest` — pending, deployment must be ActiveClinic
2. `issueActiveClinicLoginRedeemCode` — attach usable platform identity
3. `redeemActiveClinicLoginTransfer` — one-time consume → `createPlatformIdentitySession`

No email / WhatsApp / SMS delivery in this stage.

## 5. Isolation

- AC transfer cannot be created on BlessBoard deployment
- BB `tenant_login` consume still requires `purpose = tenant_login` + `user_id`
- AC redeem requires `purpose = activeclinic_login` + `platform_identity_id`
- Cross-product redemption denied
- Cookie namespace remains deployment-specific after session creation

## 6. Expiry / one-time use

Unchanged TTL (`TRANSFER_TTL_MS`). Consumed transfers cannot be reused. Expired transfers denied at load/issue/redeem.

## 7. Compatibility

BlessBoard apex→tenant transfer HTTP paths are unchanged. `mapTransfer` now also exposes `platformIdentityId` (null for BB).

## 8. Migration order

1. Platform identities (020) + optional session column
2. Session/transfer principal migration (022)
3. Writers/resolvers/AC transfer service
4. Later: AC login wires transfer + session writer

## 9. Rollback

Stop using AC transfer APIs; drop additive column/purpose values if reversing migration. BlessBoard transfers unaffected.

## 10. Gate

Auth-transfer foundation is ready for AC-V6-08 login wiring. Login UI is still out of scope.
