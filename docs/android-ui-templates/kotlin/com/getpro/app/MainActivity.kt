package com.getpro.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.getpro.app.ui.navigation.AppNavigation
import com.getpro.app.ui.support.SampleData
import com.getpro.app.ui.theme.GetProTheme

/**
 * Wire-up entry when copied into an Android module.
 * TODO: enable Compose in build.gradle, add dependencies, set theme in manifest.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GetProTheme {
                Surface(Modifier.fillMaxSize()) {
                    AppNavigation(
                        sampleCategories = SampleData.categories,
                        sampleResults = SampleData.professionals,
                        sampleProfile = SampleData.profile,
                    )
                }
            }
        }
    }
}
