Biocore Web

Structure:
- `frontend/public` — static HTML/CSS/JS. Start with `npm start` (requires `http-server`) or open `index.html`.
- `server` — simple Ktor server to serve frontend files on port 8080.
- `docker` — Dockerfile to build container.

Quick start (frontend only):
```powershell
cd biocore-web\frontend
npx http-server public -p 8080
# then open http://localhost:8080
```

Quick start (server):
```powershell
cd biocore-web\server
./gradlew run
# then open http://localhost:8080
```

Changes made by scaffold script:
- Created `frontend/public` with `index.html`, `css/styles.css`, `js/app.js` (simple local calculator + localStorage).
- Added `frontend/package.json` with `start` script using `http-server`.
- Added `server` Ktor app: `build.gradle.kts`, `settings.gradle.kts`, `src/main/kotlin/com/officer/biocore/Server.kt`.
- Added Gradle wrapper scripts in `server/gradlew` and `server/gradlew.bat` plus `server/gradle/wrapper/gradle-wrapper.properties` (note: `gradle-wrapper.jar` is not included — see below).
- Added `docker/Dockerfile` for a simple container layout.

Notes about the Gradle wrapper:
- I added the wrapper scripts and `gradle-wrapper.properties` which point to the Gradle distribution.
- The `gradle-wrapper.jar` file is not included in the repo because it is a binary; to enable `./gradlew` you must either:
    - run `gradle wrapper` on a machine that has Gradle installed (this will create the missing `gradle-wrapper.jar`), or
    - copy a `gradle-wrapper.jar` into `server/gradle/wrapper/` from another project.
- After the jar is present you can run `./gradlew run` from `biocore-web/server` and the wrapper will download the Gradle distribution and run the Ktor server.

What I suggest next:
- If you want, I can add the actual `gradle-wrapper.jar` binary into the repo for you, or I can create a small PowerShell script that downloads it automatically. Tell me which you prefer.

### 1. **Technology Stack**
   - **Frontend**: HTML, CSS, JavaScript
   - **Backend** (if needed): You can use Node.js with Express for server-side logic, or you can keep it entirely client-side if you don't need a backend.
   - **Database** (if needed): You can use a database like MongoDB or SQLite to store food items and their nutritional information.

### 2. **Frontend Development**
   - **HTML**: Create the structure of your web application. This includes forms for user input (e.g., food items, quantities).
   - **CSS**: Style your application to make it visually appealing.
   - **JavaScript**: Implement the logic to calculate calories and nutrients. You can use JavaScript to handle user input, perform calculations, and update the UI dynamically.

### 3. **Backend Development (Optional)**
   - If you want to store user data or have a more complex application, you can set up a backend using Node.js.
   - Create RESTful APIs to handle requests for food data, calculations, etc.

### 4. **Data Source**
   - You will need a source of nutritional information. This could be a public API (like the USDA FoodData Central API) or a static dataset that you include in your application.

### 5. **Deployment**
   - You can deploy your web application on a server using services like Heroku, Vercel, or Netlify.
   - Alternatively, you can run it locally on your computer using a simple HTTP server (like `http-server` in Node.js).

### 6. **Kotlin Integration**
   - If you want to use Kotlin, you can consider using Kotlin/JS, which allows you to write Kotlin code that compiles to JavaScript. This way, you can leverage your existing Kotlin knowledge while developing the web application.
   - You can also use Kotlin for backend development with frameworks like Ktor.

### 7. **Example Structure**
Here’s a simple example of how your project structure might look:

```
/calorie-calculator
|-- /public
|   |-- index.html
|   |-- styles.css
|   |-- script.js
|-- /server (if using Node.js)
|   |-- server.js
|-- /data (if using static data)
|   |-- foodData.json
|-- package.json (if using Node.js)
```

### 8. **Basic Example Code**
Here’s a very basic example of what your HTML and JavaScript might look like:

**index.html**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="styles.css">
    <title>Calorie Calculator</title>
</head>
<body>
    <h1>Calorie and Nutrient Calculator</h1>
    <input type="text" id="foodItem" placeholder="Enter food item">
    <input type="number" id="quantity" placeholder="Enter quantity (g)">
    <button id="calculateBtn">Calculate</button>
    <div id="result"></div>
    <script src="script.js"></script>
</body>
</html>
```

**script.js**
```javascript
document.getElementById('calculateBtn').addEventListener('click', function() {
    const foodItem = document.getElementById('foodItem').value;
    const quantity = document.getElementById('quantity').value;

    // Example static data (you would replace this with a real data source)
    const foodData = {
        'apple': { calories: 52, protein: 0.3, carbs: 14 },
        'banana': { calories: 89, protein: 1.1, carbs: 23 }
    };

    const food = foodData[foodItem.toLowerCase()];
    if (food) {
        const totalCalories = (food.calories * quantity) / 100;
        const totalProtein = (food.protein * quantity) / 100;
        const totalCarbs = (food.carbs * quantity) / 100;

        document.getElementById('result').innerHTML = `
            <p>Calories: ${totalCalories.toFixed(2)}</p>
            <p>Protein: ${totalProtein.toFixed(2)}g</p>
            <p>Carbs: ${totalCarbs.toFixed(2)}g</p>
        `;
    } else {
        document.getElementById('result').innerHTML = '<p>Food item not found.</p>';
    }
});
```

### Conclusion
Creating a web application for calorie and nutrient calculation is entirely feasible with the technologies you mentioned. You can start simple and gradually add more features, such as user accounts, food databases, and more complex calculations. Good luck with your project!