package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.app.Activity
import android.os.Bundle

class NoOpActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Immediately finish with no animation and no UI
        finish()
        overridePendingTransition(0, 0)
    }
}
