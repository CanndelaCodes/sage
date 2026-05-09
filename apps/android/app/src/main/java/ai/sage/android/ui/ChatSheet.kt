package ai.sage.android.ui

import androidx.compose.runtime.Composable
import ai.sage.android.MainViewModel
import ai.sage.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
