package com.getpro.app.data.mapper

import com.getpro.app.data.TenantConfig
import com.getpro.app.data.api.dto.BusinessOnboardingRequestDto
import com.getpro.app.data.repository.OnboardingSubmission

/**
 * Maps domain [OnboardingSubmission] → transport [BusinessOnboardingRequestDto].
 * Optional [OnboardingSubmission.email] is sent in [BusinessOnboardingRequestDto.vat_or_pacra] until a dedicated
 * `email` column exists on the API (see `docs/android-onboarding-api.md`).
 */
fun OnboardingSubmission.toBusinessOnboardingRequestDto(tenant: TenantConfig): BusinessOnboardingRequestDto =
    BusinessOnboardingRequestDto(
        profession = profession.trim(),
        city = city.trim(),
        name = businessName.trim(),
        phone = phone.trim(),
        vat_or_pacra = email.trim(),
        tenantId = tenant.tenantId,
        tenantSlug = tenant.tenantSlug,
    )
