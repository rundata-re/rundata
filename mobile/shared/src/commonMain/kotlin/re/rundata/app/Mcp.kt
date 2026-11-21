package re.rundata.app

import io.ktor.client.HttpClient
import io.ktor.client.request.accept
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.content.TextContent
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** Une réponse qui n'a pas pu être lue : rundata.re injoignable, une erreur de l'outil, une réponse illisible. */
class McpErreur(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Le serveur MCP public de rundata.re, la seule source de l'appli : un appel `tools/call` en JSON-RPC, sans compte.
 * `userAgent` : « rundata.re-android/<version> », honnête.
 */
class RundataMcp(private val http: HttpClient, private val userAgent: String, private val adresse: String = ADRESSE) {
    private var dernier = 0

    /** Le texte JSON que rend l'outil `outil`, lu en objet. */
    suspend fun appeler(outil: String, arguments: Map<String, String> = emptyMap()): JsonObject {
        val corps = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", ++dernier)
            put("method", "tools/call")
            putJsonObject("params") {
                put("name", outil)
                putJsonObject("arguments") { arguments.forEach { (k, v) -> put(k, v) } }
            }
        }
        val reponse = try {
            http.post(adresse) {
                header(HttpHeaders.UserAgent, userAgent)
                accept(ContentType.Application.Json)
                accept(ContentType.Text.EventStream)
                setBody(TextContent(corps.toString(), ContentType.Application.Json))
            }
        } catch (e: Exception) {
            throw McpErreur("rundata.re ne répond pas", e)
        }
        if (!reponse.status.isSuccess()) throw McpErreur("rundata.re a répondu ${reponse.status.value}")
        val flux = reponse.contentType()?.match(ContentType.Text.EventStream) == true
        return lireReponse(reponse.bodyAsText(), flux)
    }

    companion object {
        const val ADRESSE = "$SITE/mcp"
    }
}

private val JSON = Json { ignoreUnknownKeys = true }

/** L'objet JSON du texte d'une réponse `tools/call`, en JSON simple ou en flux d'événements (`data: …`). */
internal fun lireReponse(texte: String, flux: Boolean): JsonObject {
    val json = if (flux) texte.lineSequence().filter { it.startsWith("data:") }.map { it.removePrefix("data:").trim() }.lastOrNull()
        ?: throw McpErreur("réponse vide") else texte
    val racine = try {
        JSON.parseToJsonElement(json).jsonObject
    } catch (e: Exception) {
        throw McpErreur("réponse illisible", e)
    }
    (racine["error"] as? JsonObject)?.let { throw McpErreur(it["message"]?.jsonPrimitive?.contentOrNull ?: "erreur du serveur") }
    val resultat = racine["result"] as? JsonObject ?: throw McpErreur("réponse sans résultat")
    val contenu = resultat["content"]?.jsonArray
        ?.firstOrNull { (it as? JsonObject)?.get("type")?.jsonPrimitive?.contentOrNull == "text" }
        ?.jsonObject?.get("text")?.jsonPrimitive?.contentOrNull
        ?: throw McpErreur("réponse sans texte")
    val objet = try {
        JSON.parseToJsonElement(contenu).jsonObject
    } catch (e: Exception) {
        throw McpErreur("texte illisible", e)
    }
    if (resultat["isError"]?.jsonPrimitive?.booleanOrNull == true) {
        throw McpErreur(objet["erreur"]?.jsonPrimitive?.contentOrNull ?: "erreur de l'outil")
    }
    return objet
}
