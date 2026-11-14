# Portal activation changes

Registration still redirects to login and does not call `issueAuthenticatedSessionCookie`. A guest token for another clinic still returns `invalid_guest_token` before an identity is created. A booking that already has a portal owner still returns `link_conflict`. The same owner can repeat the link without a second row. `/activate/:token` is still the staff route.

The reset token was consumed after the password write, and the update matched the token id only. It now uses `markConsumed`, the same one-time update the staff activation path already uses: `consumed_at IS NULL`, `revoked_at IS NULL`, and `expires_at > now()`. The password is set only after that update matches. A lost race returns `token_already_used` and does not write the password. An expired or revoked token is still rejected before the transaction.

A valid public booking lookup token is still not revoked. That lets the receipt be opened again. It is not the reset token.
