package rocks.teagantotally.eddie.ui.disconnected.connect

import android.os.Bundle
import android.view.View
import kotlinx.android.synthetic.main.fragment_connection_error.*
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.ui.BaseFragment
import rocks.teagantotally.eddie.ui.annotations.Layout

/**
 * Created by tglenn on 2/22/18.
 */
@Layout(R.layout.fragment_connection_error)
class ConnectionErrorFragment : BaseFragment() {
    companion object {
        const val ARG_ERROR_MESSAGE = "ERROR_MESSAGE"

        fun create(errorMessage: String): ConnectionErrorFragment =
            with(ConnectionErrorFragment()) {
                arguments = with(Bundle()) {
                    putString(ARG_ERROR_MESSAGE, errorMessage)
                    this
                }
                this
            }
    }

    /**
     * Called immediately after [.onCreateView]
     * has returned, but before any saved state has been restored in to the view.
     * This gives subclasses a chance to initialize themselves once
     * they know their view hierarchy has been completely created.  The fragment's
     * view hierarchy is not however attached to its parent at this point.
     * @param view The View returned by [.onCreateView].
     * @param savedInstanceState If non-null, this fragment is being re-constructed
     * from a previous saved state as given here.
     */
    override fun onViewCreated(view: View?, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        with(error_message) {
            text = arguments?.getString(ARG_ERROR_MESSAGE, "ERROR")
        }
    }
}