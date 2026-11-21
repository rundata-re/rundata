package re.rundata.app

import io.ktor.client.HttpClient

/** Le client HTTP de la plateforme (OkHttp sur Android, celui d'Apple sur l'iPhone), avec ses délais. */
expect fun clientHttp(): HttpClient
