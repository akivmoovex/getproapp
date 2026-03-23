package com.getpro.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview

enum class GetProTab {
    Home,
    Categories,
    Business,
}

@Composable
fun GetProBottomNav(
    selected: GetProTab,
    onSelect: (GetProTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        val items = listOf(
            Triple(GetProTab.Home, "Home", Icons.Filled.Home),
            Triple(GetProTab.Categories, "Categories", Icons.Filled.List),
            Triple(GetProTab.Business, "Business", Icons.Filled.Person),
        )
        items.forEach { (tab, label, icon) ->
            NavigationBarItem(
                selected = selected == tab,
                onClick = { onSelect(tab) },
                icon = { Icon(icon, contentDescription = null) },
                label = { Text(label, style = MaterialTheme.typography.labelMedium) },
                alwaysShowLabel = true,
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun GetProBottomNavPreview() {
    GetProBottomNav(selected = GetProTab.Home, onSelect = {})
}
