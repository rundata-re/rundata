package re.rundata.app.android

import android.content.Context
import kotlinx.serialization.json.JsonObject

/** La version publiée ne simule jamais rien : les alertes sont toujours lues de rundata.re. */
@Suppress("UNUSED_PARAMETER")
fun alertesSimulees(context: Context): () -> Pair<JsonObject?, JsonObject?>? = { null }
