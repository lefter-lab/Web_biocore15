FROM eclipse-temurin:17-jdk-alpine
WORKDIR /app
COPY server/build/libs /app/server
COPY frontend/public /app/frontend
EXPOSE 8080
CMD ["java", "-jar", "server/app.jar"]
/calorie-calculator
│
├── /public
│   ├── index.html
│   ├── styles.css
│   └── script.js
│
├── /backend (if using a backend)
│   ├── server.kt (Kotlin backend)
│   └── package.json (if using Node.js)
│
└── README.md