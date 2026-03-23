package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Lightweight placeholder for supply-side entry promos / experiments. No repository yet.
 * TODO: deep links, “manage listing” when accounts exist.
 */
class BusinessEntryViewModel : ViewModel() {
    private val _dummy = MutableStateFlow(0)
    val dummy: StateFlow<Int> = _dummy.asStateFlow()
}
