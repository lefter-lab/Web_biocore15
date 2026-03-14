NETLIFY CLI Deploy — Step‑by‑step

1) Инсталиране (ако още нямаш Node.js)
- Инсталирай Node.js (LTS) от https://nodejs.org/ и рестартирай терминала.
- (По желание) инсталирай Netlify CLI глобално:

    npm install -g netlify-cli

2) Вход в Netlify (препоръчително, автоматично отваря браузър):

    netlify login

или използвай `npx` (ще поиска да влезеш при първия deploy):

    npx netlify-cli login

3) Свързване на локалното копие със съществуващ Netlify сайт (по избор)
- Ако вече имаш сайт в Netlify и искаш да го свържеш локално, изпълни:

    netlify link

  Това ще добави `.netlify/state.json` и ще ти покаже `site id`.
- Ако нямаш сайт, можеш да създадеш ново site от UI (Netlify → New site → From Git) или от CLI:

    netlify sites:create --name my-biocore-site

4) Ръчен deploy (бърз тест — draft deploy):

    cd path/to/biocore-web
    npx netlify-cli deploy --dir=frontend/public

Това ще ти даде preview URL (not production).

5) Продакшън deploy (overwrite live site)
- Ако си свързал локалното копие (`netlify link`) или имаш `site id`, използвай:

    netlify deploy --dir=frontend/public --prod

# или ако не си линкнал, укажи site id:

    netlify deploy --dir=frontend/public --prod --site <SITE_ID>

6) Скрипт за автоматичен deploy (от репото)
- Има добавен PowerShell скрипт `deploy_netlify.ps1` в репото. Примери:

    # Draft deploy (preview):
    .\deploy_netlify.ps1

    # Production deploy (requires login or site id):
    .\deploy_netlify.ps1 -Prod

    # Production deploy to specific site id:
    .\deploy_netlify.ps1 -Prod -SiteId xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

7) Автоматични деплой при push
- Можеш да свържеш GitHub repo към Netlify в UI (New site → From Git) и Netlify автоматично ще билдва главния бранч.
- Ако предпочиташ CI/CD, нашето GitHub repo вече съдържа `netlify.toml` с publish dir `frontend/public`.

8) Често срещани проблеми
- Ако CLI изисква автентикация: изпълни `netlify login`.
- Ако `netlify` не е намерен: използвай `npx netlify-cli` или инсталирай глобално.
- Ако publish dir е празен — провери че `frontend/public` съдържа `index.html`.

9) Security / tokens
- За CI (GitHub Actions) можеш използва Netlify deploy token и да го добавиш като `NETLIFY_AUTH_TOKEN` secret.
- Примерна команда за CI:

    npx netlify-cli deploy --dir=frontend/public --prod --auth ${{ secrets.NETLIFY_AUTH_TOKEN }} --site ${{ secrets.NETLIFY_SITE_ID }}

---
Ако искаш, мога да добавя примерен GitHub Actions workflow, който използва `NETLIFY_AUTH_TOKEN` и деплойва автоматично при push към `master`.
