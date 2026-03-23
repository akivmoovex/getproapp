package com.getpro.app.data

/**
 * Values shipped per app flavor / store listing — mirror web `tenantId` + `tenantSlug` on POST bodies.
 * TODO: Replace with `BuildConfig.TENANT_ID` / `BuildConfig.TENANT_SLUG` in real module.
 */
data class TenantConfig(
    val tenantId: Long,
    val tenantSlug: String,
) {
    companion object {
        /**
         * Placeholder for templates — **must** match a real `tenants` row (id + slug) in production
         * (`resolveTenantIdStrict` in `src/routes/api.js`). Change per flavor / `BuildConfig`.
         */
        val prototype: TenantConfig = TenantConfig(tenantId = 1L, tenantSlug = "zm")
    }
}
