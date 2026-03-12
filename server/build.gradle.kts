plugins {
    kotlin("jvm") version "1.9.20"
    application
}

repositories { mavenCentral() }

dependencies {
    implementation("io.ktor:ktor-server-netty:2.3.4")
    implementation("ch.qos.logback:logback-classic:1.4.11")
}

application {
    mainClass.set("com.officer.biocore.ServerKt")
}
/calorie-calculator
│
├── /public
│   ├── index.html
│   ├── styles.css
│   └── script.js
│
├── /server (if using a backend)
│   ├── server.js (Node.js server)
│   └── routes.js
│
└── /data (optional)
    └── foodData.json (JSON file with food items and nutrients)