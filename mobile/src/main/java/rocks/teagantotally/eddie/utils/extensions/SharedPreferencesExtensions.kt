package rocks.teagantotally.eddie.utils.extensions

import android.content.SharedPreferences

/**
 * Created by tglenn on 2/15/18.
 */

inline fun SharedPreferences.edit(action: SharedPreferences.Editor.() -> Unit) {
    val editor = edit()
    action(editor)
    editor.apply()
}