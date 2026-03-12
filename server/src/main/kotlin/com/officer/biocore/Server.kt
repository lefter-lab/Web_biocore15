package com.officer.biocore

import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.application.*
import io.ktor.http.content.*
import io.ktor.response.*
import io.ktor.routing.*

fun main() {
    embeddedServer(Netty, port = 8080) {
        routing {
            static("/") {
                resources("public")
                staticRootFolder = java.io.File("../frontend/public")
                file("index.html")
            }
            get("/ping") { call.respondText("pong") }
        }
    }.start(wait = true)
}
/calorie-calculator
|-- /public
|   |-- index.html
|   |-- styles.css
|   |-- script.js
|-- /server (if using a backend)
|   |-- server.js (or Application.kt for Kotlin backend)
|-- package.json (if using Node.js)