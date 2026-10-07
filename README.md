<p align="center">
  <img src="assets/banner.png" alt="E.R.I.N. banner: pixel-art Telegram icon and receipt feeding into a spreadsheet" width="100%">
</p>

# E.R.I.N.

E.R.I.N. is a Telegram bot for petty-cash (caja chica) bookkeeping. You send it a receipt photo or a short text message, Gemini reads it, and the bot writes a row into a Google Sheet. It runs entirely on Google Apps Script, so there is no server to host. The bot speaks Spanish and is tuned for receipts from Panama.

## Why it exists

A small household and business needed one person to log petty-cash spending without learning a new app or filling in a spreadsheet by hand. Everyone already uses a chat app, so the interface is a Telegram chat: photograph the receipt, or type "22.50 cash groceries", and the bookkeeping happens in the background. The Sheet stays the source of truth, and an optional copy goes to an Excel file in Drive for people who work in Excel.

## Features

- Reads receipt photos (JPEG, PNG, WEBP, HEIC, HEIF) and PDFs with Gemini, and writes one Sheet row per receipt with the breakdown: items, discounts, ITBMS tax, tips and other charges.
- Understands short text messages for expenses, deposits, cash-count checks and corrections.
- Asks a follow-up question when something is missing, such as the vendor or the receipt total.
- Splits spending between two houses (or marks it as shared) and assigns an expense class.
- Converts foreign currencies to USD using the receipt date. USD and PAB are treated as equal.
- Archives each photo in a Drive folder organized by month and links it from the row.
- Lets you correct or delete the last entry by replying to the bot's confirmation.
- Retries photos that failed, falls back to a second model, and ignores duplicate Telegram deliveries.
- Optionally mirrors the Sheet to an existing Excel file in Drive every 5 minutes, one way only.

## How it works

Telegram sends each message to the script's web app URL (`doPost` in `src/WebhookApp.js`). The webhook URL carries a secret, and the bot only accepts messages from the one chat ID you configure. Anything else is dropped.

The code follows a two-layer convention. Most files without the `App` suffix (`Texto.js`, `Extraccion.js`, `Reglas.js`, `Moneda.js`, `Hoja.js` and so on) are pure logic with no Google calls. Two exceptions call Google services directly: `Gemini.js` (the HTTP call to Gemini and the API key lookup) and `Instalacion.js` (the setup and trigger functions run from the editor). They take plain objects and return plain objects, which is why the whole test suite runs in Node. Files ending in `App.js` (`WebhookApp.js`, `EscrituraApp.js`, `HojaApp.js` and so on) are the thin layer that talks to Telegram, Sheets, Drive, Gemini and Groq, and they pass those services into the pure code.

For extraction the bot uses these models, all set in `src/Config.js`:

- `gemini-3.5-flash-lite` reads the message or photo first.
- `gemini-3.8-flash` rereads a photo when the first model returns a handwritten receipt with doubtful fields. It is also the last try after transient errors: when a call to the first model fails with a network error or a temporary HTTP error, the bot waits and retries the same model once, and if that also fails the same way it tries `gemini-3.8-flash`. Other errors are not retried. If a Groq key is set and Gemini answers 429 or 503, the bot skips the retries and goes straight to Groq.
- `qwen/qwen3.8-27b` on Groq is an optional fallback when Gemini fails. It only reads JPEG and PNG. PDFs are first run through Drive OCR and the text is sent instead. Without a Groq key, a failed photo goes through Drive OCR and a yes/no question to the user, and `reintentarFotos` retries pending photos.

The Sheet has one tab per month (for example "Septiembre 2026"), plus internal tabs: `_ESTADO` (bot state), `_HISTORIAL` (imported history of past months) and `_EDICIONES` (log of manual edits). The month tabs hold one row per receipt with these visible columns: FECHA, ID FACTURA, PROVEEDOR, DESCRIPCIÓN, DEPÓSITO, ARTÍCULOS, DESCUENTOS, ITBMS, OTROS CARGOS, GASTO (USD), MONEDA, MONTO ORIGINAL, TASA USADA, FORMA DE PAGO, CLASE DE GASTO, COMENTARIOS, FOTO, REVISAR, CASA.

The Excel mirror (`src/Espejo.js`, `src/EspejoApp.js`) exports the Sheet as .xlsx every 5 minutes, only if the Sheet changed, and overwrites an existing .xlsx file in Drive, so its ID and share link stay the same.

## Requirements

- A Google account that can use Google Sheets, Drive and Apps Script.
- Node.js and npm, for `clasp` and for the tests. The tests use only the built-in `node:test` runner and have no dependencies. The suite was last run on Node 26.
- `clasp`, the Apps Script command-line tool: `npm install -g @google/clasp`.
- A Telegram account, to create a bot with BotFather.
- A Gemini API key from Google AI Studio.
- Optional: a Groq API key from console.groq.com (the free plan works).

## Setup

### 1. Create the Google resources

In Drive, create:

- A Google Sheet for the petty cash. Note its ID (the long string in its URL between `/d/` and `/edit`).
- A root folder for the project, a subfolder named "Facturas" for archived photos, and a folder for the Excel files of earlier months. Note each folder ID (the last part of the folder URL).
- An .xlsx file to receive the mirror. Note its ID. Upload it, do not convert it to a Google Sheet.

### 2. Get the tokens

- Telegram bot token: open a chat with `@BotFather` in Telegram, send `/newbot`, and follow the prompts. BotFather replies with a token like `123456789:AA...`.
- Gemini key: create one at https://aistudio.google.com/apikey.
- Groq key (optional): create one at https://console.groq.com/keys.
- Webhook secret: make up a random string of 32 to 256 characters using only letters, digits, `_` and `-`. For example: `openssl rand -hex 32`.
- Telegram chat ID: send any message to your new bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser, with your real token in place of `<TOKEN>`. Find `"chat":{"id":123456789` in the response. That number is your chat ID. If the response is empty, send the bot another message and reload. Do this before you register the webhook, because Telegram stops serving `getUpdates` once a webhook is active. Treat the token like a password and do not share that URL.

### 3. Get the code and create the Apps Script project

```bash
git clone <your-fork-url> project-dir
cd project-dir
npm install -g @google/clasp
clasp login
```

Then either create a new project:

```bash
clasp create --type standalone --title "E.R.I.N." --rootDir src
```

or clone an empty project you made in the Apps Script editor. Either way you need the script ID. Copy the template and put the ID in:

```bash
cp .clasp.json.example .clasp.json
```

Edit `.clasp.json` and replace `TU_SCRIPT_ID` with your script ID. If `clasp create` already wrote a `.clasp.json`, check that `rootDir` is `src`. `.clasp.json` is in `.gitignore` and must stay out of the repository.

In the Apps Script project settings, check that the time zone matches `src/appsscript.json` (the file sets `America/Panama`). The project uses the Drive advanced service (v3), which `appsscript.json` already enables.

### 4. Fill in the configuration

Edit `src/Config.js` and replace every value that starts with `TU_` with your own. See [Configuration reference](#configuration-reference). Leave `WEBAPP_URL` for now. The bot refuses to run while any `TU_` placeholder remains. This is deliberate: `registrarWebhook` and `instalarDisparadores` throw an error naming the missing values, and `doPost` accepts the Telegram request but processes nothing. It prevents a half-configured bot from touching your data.

```bash
clasp push --force
```

### 5. Set the Script Properties

In the Apps Script editor, open Project Settings, then Script Properties, and add:

- `TELEGRAM_TOKEN`
- `GEMINI_API_KEY`
- `WEBHOOK_SECRET`
- `GROQ_API_KEY` (optional)

Values must not have spaces at the start or end.

### 6. Run the checks from the editor

Open the editor, pick each function in the dropdown and run it. The output appears in the execution log.

1. `autorizar` asks for all permissions, then tests Sheet, Drive, internet, triggers and the Excel file. It returns false if any of them fails.
2. `verificarPropiedades` reports which Script Properties exist and have the right shape. It never prints a secret.
3. `verificarConfiguracion` lists any `TU_` value still left in `src/Config.js`.
4. `configurarHoja` creates the current month's tab and the internal tabs.

### 7. Deploy as a web app

1. In the editor choose Deploy, then New deployment, type Web app.
2. Set "Execute as" to Me and "Who has access" to Anyone. Telegram has to be able to call the URL without a Google login. The webhook secret protects it.
3. Copy the web app URL ending in `/exec`.
4. Paste it into `WEBAPP_URL` in `src/Config.js` (without the secret) and run `clasp push --force` again.

`clasp push` only updates the saved code. It does not change what the live deployment runs. After every code change you want live, go to Deploy, Manage deployments, edit the existing deployment, choose New version, and deploy. Edit the same deployment each time. Creating a new deployment gives a new `/exec` URL and breaks the webhook.

### 8. Register the webhook and triggers

Run these in the editor, in this order:

1. `registrarWebhook` tells Telegram to send updates to your `/exec` URL with the secret.
2. `verWebhook` shows what Telegram has stored: pending updates and the last error.
3. `instalarDisparadores` installs the `alEditar` on-edit trigger and the `copiarAExcel` trigger that runs every 5 minutes. It is safe to run again.

Send "ayuda" to your bot. If it answers with the guide, it works.

## Usage

The bot talks in Spanish. Its help text (`textoGuia_` in `src/Texto.js`) lists what it understands. Below are the same examples with English explanations. The text you type to the bot stays in Spanish.

- An expense: `22.50 efectivo super Riba Smith` (22.50, paid in cash, at the supermarket Riba Smith). With a tip: `22.50 Riba, 1.50 de propina`.
- A deposit: `me depositaron 250` ("I was given 250").
- A cash check: `tengo 85` ("I have 85"), to compare against the expected balance.
- The house: add the name of either house to a message, for example the names you set in `CASAS`. Without one, the row is marked COMPARTIDO (shared).
- A correction: reply to the bot's confirmation with the change, or write `corrige el último: ...`.
- A deletion: reply `borrar` to the confirmation, or write `borra el último`.
- A receipt: send the photo. You can add a house name or a comment as the caption.
- `ayuda` shows the guide again.

## Configuration reference

### `CONFIG` in `src/Config.js`

| Field | What it is |
|---|---|
| `ERIN_FOLDER_ID` | Root project folder in Drive. |
| `FACTURAS_FOLDER_ID` | The "Facturas" subfolder where receipt photos are archived. |
| `SHEET_ID` | The petty-cash Google Sheet. |
| `HISTORIAL_FOLDER_ID` | Folder with the Excel files of earlier months. |
| `EXCEL_ESPEJO_ID` | Existing .xlsx in Drive that receives the mirror. It is overwritten, keeping its ID and link. |
| `ERIN_CHAT_ID` | Numeric Telegram chat ID of the person who uses the bot. Messages from any other chat are ignored. |
| `NOMBRE_USUARIO` | The name the bot uses to greet that person. |
| `TIMEZONE` | IANA time zone, default `America/Panama`. Must match `timeZone` in `src/appsscript.json`. |
| `WEBAPP_URL` | The `/exec` URL of the web app deployment, without the secret. |
| `MODELO_PRINCIPAL` | First Gemini model, default `gemini-3.5-flash-lite`. |
| `MODELO_RELECTURA` | Second Gemini model for rereads and retries, default `gemini-3.8-flash`. |
| `MODELO_GROQ` | Groq fallback model, default `qwen/qwen3.8-27b`. |
| `DEPOSITANTE_POR_DEFECTO` | Who is recorded as the depositor when the message does not say. |
| `HISTORIAL_ANIO` | Year of the old Excel files that `importarArchivosViejos` brings in, default 2026. |
| `HISTORIAL_MESES` | Months (1 to 12) of those files, default January to August. |
| `CASAS.PRINCIPAL` and `CASAS.SECUNDARIA` | The two houses expenses are split between. Each has `nombre` (how the user says it), `etiqueta` (uppercase suffix on the expense class in the Sheet, such as `GROCERIES W1 <etiqueta>`), `descripcion` (how the prompt describes it to Gemini) and `palabras` (words the user types to choose it). |

### Script Properties

| Property | Required | Notes |
|---|---|---|
| `TELEGRAM_TOKEN` | yes | From BotFather. Shape `digits:letters`. |
| `GEMINI_API_KEY` | yes | From Google AI Studio. |
| `WEBHOOK_SECRET` | yes | 32 to 256 characters of `A-Za-z0-9_-`. Sent to Telegram and checked on every request. |
| `GROQ_API_KEY` | no | Turns on the Groq fallback. Without it the fallback is off. |

The code also stores a few internal markers in Script Properties, such as the last mirror time. You do not set those.

## Editor functions

Run these by hand from the Apps Script editor.

| Function | Purpose |
|---|---|
| `autorizar` | Requests all permissions, then tests Sheet, Drive, internet, triggers and the Excel file. |
| `verificarPropiedades` | Reports whether each Script Property exists and has the right shape. |
| `verificarConfiguracion` | Lists `TU_` placeholders left in `src/Config.js`. |
| `configurarHoja` | Creates the current month's tab and the internal tabs. |
| `instalarDisparadores` | Installs the on-edit trigger and the 5-minute Excel mirror trigger. Idempotent. |
| `registrarWebhook` | Registers `WEBAPP_URL` and the secret with Telegram. |
| `verWebhook` | Shows Telegram's webhook status, pending updates and last error. |
| `copiarAExcel` | Copies the Sheet to the Excel file now, if it changed since the last copy. |
| `reintentarFotos` | Retries photos that are still pending and logs one line per photo. |
| `revisarEdiciones` | Rebuilds the log of manual edits after a loss. |
| `protegerPestanasInternas` | Protects `_ESTADO`, `_HISTORIAL` and `_EDICIONES` against accidental edits. |
| `importarArchivosViejos` | Imports the old monthly Excel files as "(archivo)" tabs. Running it again does not duplicate. |
| `probarGemini` | Checks that the configured Gemini models exist. Uses 4 model calls. |
| `probarGroq` | Checks that the Groq key and model answer in JSON mode. |

Other helpers in the source, mostly for setup and one-time migrations: `verHoja` (lists tabs and sizes), `agregarColumnaCasa`, `migrarUnaFila`, `importarHistorial`, `reimportarHistorialExacto`, `cerrarRegistrosSinPestana`, `revisarDatosDePrueba` and `borrarDatosDePrueba` (run the first, then the second, to remove test data), `probarCarpetas`, `probarOcr` and `probarRepetido`. Read the comment above each one before running it. `migrarUnaFila` is written for one specific tab and stops if it finds something unexpected.

## Running the tests

```bash
npm test
npm run coverage
```

The suite runs in Node with the built-in test runner and needs no `npm install`. `npm run coverage` fails if line, branch or function coverage drops below 80 percent. Tests cover the pure modules directly and the `App.js` modules through fake Google services.

## Customizing

Time zone: change `TIMEZONE` in `src/Config.js` and `timeZone` in `src/appsscript.json`. Keep them equal.

Language: every message the bot sends and the Gemini prompts are in Spanish, written in `src/Texto.js`, `src/Mensajes.js`, `src/MensajesFoto.js`, `src/Foto.js`, `src/Confirmacion.js` and related files. The Sheet column names (`src/Hoja.js`) and month names are Spanish too. Translating means editing those strings, and the tests that check them.

Panama-specific handling: the prompts and rules know the ITBMS sales tax, Yappy and bank transfers as payment methods, PAB as equal to USD, and expense classes such as SIPE (social security payment) and décimo tercer mes (the thirteenth-month payment). The classes and keywords are in `src/Clases.js`, and the receipt instructions are in `src/Foto.js`. To adapt to another country, edit those two files, the currency list in `src/Moneda.js` and `src/Texto.js`.

## Limitations

- It serves one Telegram chat. There is no multi-user support.
- The Excel mirror is one way. Edits made in the .xlsx are overwritten by the next copy.
- All of `EXCEL_ESPEJO_ID`, `HISTORIAL_FOLDER_ID` and the other IDs must be set. The configuration check, `autorizar` and `instalarDisparadores` treat the Excel file as part of the install. To run without a mirror you would need to edit the code.
- Groq reads only JPEG and PNG, and the free Groq plan has rate limits.
- Gemini can misread receipts, handwriting especially. The REVISAR column flags uncertain rows, but you should still check the totals.
- Apps Script has execution time and quota limits, and the exchange rates come from free public APIs.
- The bot's interface is Spanish only.
- The expense classes and the two-house split reflect the original use. Expect to adjust `CASAS` and `src/Clases.js` for yours.

### Known issues

These came out of a code review before release and are not fixed yet:

- If Telegram or Drive fails right after a photo's expense is written, the row is safe and not duplicated, but the photo can stay in "Por clasificar" and the date question is not asked again. Move the photo by hand.

## En español

E.R.I.N. es un bot de Telegram para llevar la caja chica. Le mandas la foto de una factura o un mensaje corto, Gemini lo lee y el bot escribe una fila en una hoja de Google Sheets. Corre en Google Apps Script, así que no necesitas servidor. Opcionalmente copia la hoja a un Excel en Drive cada 5 minutos.

Se creó porque un pequeño hogar y negocio necesitaba que una persona registrara los gastos de caja chica sin aprender una aplicación nueva: todos ya usan un chat.

Instalación, en resumen:

1. Crea la hoja, las carpetas de Drive y un .xlsx para el espejo.
2. Consigue el token de BotFather, la clave de Gemini (Google AI Studio), el secreto del webhook y tu chat ID.
3. `clasp login`, copia `.clasp.json.example` a `.clasp.json` y pon tu ID de script.
4. Reemplaza todos los valores `TU_...` de `src/Config.js` y haz `clasp push --force`.
5. En Propiedades del script agrega `TELEGRAM_TOKEN`, `GEMINI_API_KEY` y `WEBHOOK_SECRET` (y `GROQ_API_KEY`, opcional).
6. Ejecuta `autorizar`, `verificarPropiedades`, `verificarConfiguracion` y `configurarHoja`.
7. Implementa como aplicación web (ejecutar como yo, acceso para cualquier persona), pega la URL en `WEBAPP_URL` y vuelve a hacer `clasp push --force`.
8. Publica una nueva versión de la misma implementación, y luego ejecuta `registrarWebhook` e `instalarDisparadores`.

`clasp push` solo sube el código. No actualiza la implementación en vivo, así que cada cambio necesita una nueva versión de la misma implementación para conservar la URL `/exec`.

Ejemplos de uso (la guía que muestra el bot al escribir "ayuda"):

1. Un gasto: "22.50 efectivo super Riba Smith" (con propina: "22.50 Riba, 1.50 de propina")
2. Un depósito: "me depositaron 250"
3. Revisar la caja: "tengo 85"
4. La casa: agrega el nombre de la casa secundaria o de la principal
5. Corregir: responde a la confirmación del bot con el cambio, o escribe "corrige el último: ..."
6. Borrar: responde "borrar" a la confirmación, o escribe "borra el último"
7. Una factura: mándale la foto (puedes agregar el nombre de la casa o un comentario)

Escribe "ayuda" para ver la guía otra vez. Las pruebas se corren con `npm test`. El bot está pensado para facturas de Panamá (ITBMS, PAB, Yappy, SIPE, décimo tercer mes).

## License

MIT. See [LICENSE](LICENSE).
