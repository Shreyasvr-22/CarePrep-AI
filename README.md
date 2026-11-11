# CarePrep AI 2.2 — Multilingual Healthcare Preparation & Prescription Companion

CarePrep AI is a healthcare-domain website-development project for the **AI Growth & Automation Associate** practical assessment. It helps people learn general health concepts and prepare for conversations with qualified healthcare professionals.

> **Scope and safety:** This is an educational prototype. It does not diagnose, prescribe, triage, assess emergencies, recommend treatment changes, or replace professional care. Use fictional, non-identifying examples for demonstrations.

## Main capabilities included

1. **Multilingual AI Health Assistant** — users can ask general health-information questions and choose English, Kannada, or Hindi. They can select a simple or more detailed explanation style. Language and style preferences are saved in the browser.
2. **AI Doctor Question Generator** — turns a user-provided appointment topic into a list of neutral questions to discuss with a clinician. It does not infer diagnoses or propose treatment.
3. **Professional Visit Report Export** — visit-preparation notes can be exported using the browser's print dialog. Choose **Save as PDF** in the print destination to create a PDF. This approach uses the browser's installed fonts and supports local language text better than a built-in Latin-only PDF font.
4. **Smart Appointment Checklist** — a grouped, interactive checklist with a progress indicator. Completion state is stored in browser localStorage.
5. **Personal Health Notes Dashboard** — users can create, edit, search, copy, download, and delete notes. Notes stay in browser localStorage and are not sent to the Flask server unless the user copies their text into an AI-enabled form.
6. **Prescription Companion** — searches public DailyMed drug labels, lets the user select a label, and uses Groq to explain supplied label sections and the exact prescription wording in plain language. Users can paste local package-leaflet text if their product is not found. It also explains missed-dose wording only when an exact leaflet paragraph is supplied or identified in the selected label. If no medicine-specific missed-dose text is available, it returns a safe fallback rather than guessing.
7. **Local Medicine Reminders** — users create daily reminders at times copied from their own prescription schedule. Reminder entries are kept in browser localStorage and may trigger browser notifications while the CarePrep page is open. The feature does not calculate dose times or confirm that a dose should be taken.

## Dashboard design update (2.1)

The overview page now uses an analytics-style workspace inspired by the supplied visual reference: a branded welcome banner, compact workspace metrics, a real checklist-progress visualisation, quick-action links, recent local notes, and a dark right-side panel with the current week and suggested preparation steps. It retains CarePrep AI branding and the mint/teal palette. Dashboard metrics are based only on actual local checklist and note data; the interface does not invent health scores, patient metrics, medication data, or appointment bookings.

## Existing capabilities

- Responsive dashboard and sidebar navigation.
- General health assistant connected to Groq through the OpenAI-compatible Python SDK.
- AI-generated doctor-visit preparation notes.
- Markdown rendering for headings, lists, bold/italic text, code, blockquotes, and tables.
- Copy and text-download actions for generated notes.
- AI key configured / preview status indicator (does not claim to perform a live API health check).
- Safety boundaries and explicit privacy notices.

## Technology stack

- Python 3.10+
- Flask
- Groq API using the OpenAI-compatible `https://api.groq.com/openai/v1` endpoint
- `openai` Python SDK
- HTML, CSS, vanilla JavaScript
- Browser localStorage for non-server-side notes, checklist progress, UI preferences, and reminder settings

## Run locally on Windows

1. Install Python 3.10 or newer.
2. Extract this folder and open it in VS Code.
3. Open Terminal in the extracted `careprep_ai_v2_2` project folder.
4. Create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .venv\Scripts\activate
   ```

5. Install packages:

   ```powershell
   pip install -r requirements.txt
   ```

6. Copy `.env.example` to `.env` in the same folder.
7. Open `.env` and enter your own Groq API key:

   ```text
   GROQ_API_KEY=your_actual_groq_key_here
   GROQ_MODEL=openai/gpt-oss-20b
   PORT=5000
   FLASK_DEBUG=false
   ```

8. Start the app:

   ```powershell
   python app.py
   ```

9. Open `http://127.0.0.1:5000`.

Without a Groq API key, the app opens in Preview mode. The doctor-question generator and visit-note generator return explicitly labelled example/preview output; these are not live AI results. Live AI requires a valid key, model access, account limits, and internet access. API usage is separate from a ChatGPT subscription. Check current model availability and account limits in your Groq console.

## How to use the main features

### 1. Multilingual assistant

Open **Health assistant**, select English, Kannada, or Hindi, then select Simple or More detailed. Ask a general educational question. The selected language and style are passed to the Flask endpoint and added to the system instructions. The response language depends on the model's language capability and should be reviewed.

### 2. Doctor question generator

Open **Doctor questions**, enter a non-identifying topic and optional context, select a language, and generate a list. Review and edit the questions before using them. You can copy them or save them to My Notes.

### 3. PDF report export

Generate a visit-preparation note. Select **Export PDF**. The browser opens a print-ready report. In the print dialog, choose **Save as PDF**. The app does not save the PDF on the server. The print popup must be allowed by the browser.

### 4. Appointment checklist

Open **Appointment checklist** and check off any preparation items that apply. The progress count updates immediately. State is saved in localStorage on that browser. Use **Reset checklist** to clear it.

### 5. Personal notes dashboard

Open **My notes** to create, edit, search, copy, download, or delete notes. Notes are stored in localStorage in the current browser profile. They are **not encrypted** and may be visible to anyone who can access that browser profile. Do not use this as a medical-record system or save sensitive personal health information. Clear notes before using a shared computer.


### 6. Prescription Companion — medicine-label explanation

Open **Prescription Companion** and enter the medicine name as printed on its package. Select **Search label** to query the U.S. National Library of Medicine's DailyMed public web service. Review the returned title, strength/formulation where present, manufacturer, and publication date; select only a label that exactly matches the product. Add the wording from the prescription if you want it explained. The Groq prompt is constrained to the supplied label excerpts and user-entered text; it must not create a dose, frequency, route, duration, or treatment change. If source materials conflict, the AI identifies the discrepancy and does not choose between them.

**Important regional limitation:** DailyMed is a U.S. drug-label source. A DailyMed record may not match a brand, manufacturer, formulation, or approval sold in India or another country. Do not select a near-match. If the local product is not listed, paste the relevant wording from that exact local package leaflet and treat the AI output as a plain-language rephrasing, not independent verification. Confirm product identity and medicine questions with a local pharmacist or prescriber. DailyMed service documentation: https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm. Attribution: “This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for this product and does not endorse or recommend it.”

### 7. Missed-dose wording explainer and local reminders

The Prescription Companion is text-based: it does not identify tablets from photographs, scan prescription images, or verify a medicine from appearance. Users must type the medicine name and select an exact label or paste the relevant wording from their own package leaflet.

The **Missed-dose leaflet explainer** only explains exact medicine-specific wording from the selected label or text pasted from the local leaflet. If no source text is provided, the text is too short, or it does not explicitly mention a missed dose, the app does not ask AI to guess; it tells the user to check the exact leaflet or contact a pharmacist/prescriber. It does not decide whether a person should take a missed dose now, skip it, or double a later dose.

The **Set a medicine reminder** form stores the medicine label/name, user-selected time, and optional timing note in localStorage. The reminder repeats daily. The in-page timer and browser notification are best-effort and operate only while the CarePrep page is open; they are not a background alarm. If the page is closed at the reminder time, no alert is sent later. Only enter a reminder time that matches the instructions already given by a clinician. Reminder storage is not encrypted.

## Prescription Companion API routes

- `GET /api/prescription/search?q=<medicine-name>` — searches DailyMed's public SPL label index and returns candidate labels for the user to review.
- `POST /api/prescription/explain` — fetches a user-selected DailyMed label or accepts pasted local leaflet text, then asks Groq to explain only the supplied source material.
- `POST /api/prescription/missed-dose` — explains a user-supplied missed-dose paragraph. If no exact source text is present, it returns a non-AI safety fallback.

## AI provider configuration

The app reads `GROQ_API_KEY` and `GROQ_MODEL` from `.env`. The API key remains server-side and is never included in browser JavaScript. The AI model receives the submitted chat or form text when live AI is enabled. Local notes and checklist operations do not call the AI API.

## Privacy and responsible-use notes

- The Flask app does not create a patient database or persist visit notes server-side.
- When live AI is enabled, text submitted to the chat, doctor-question form, visit-preparation form, and prescription-explanation forms is sent to the configured Groq API for a response. Medicine names and reminder details saved locally are not sent to Groq unless the user submits them in an AI explanation form. Review Groq's current terms and data controls before using any real information.
- Browser notes, checklist state, preferences, and medicine reminders are stored in localStorage. Browser localStorage is not encrypted. Anyone with access to the same browser profile may be able to view it.
- Do not enter names, phone numbers, addresses, patient IDs, medical-record numbers, or other identifying or highly sensitive information.
- The PDF export is produced through the browser's print dialog. The generated print view contains only the note submitted for export and a general educational disclaimer.
- For possible emergencies or immediate danger, contact local emergency services or go to the nearest emergency department. Do not use this prototype to decide whether a symptom is an emergency.

## Deploy for the recruiter demonstration (Render)

This project is a portfolio demonstration. A Render **Web Service** provides a shareable HTTPS URL. Anyone who obtains that URL can open it; the app does not currently have login/password authentication. Share it only with the recruiter and people you trust. The `/robots.txt` route asks compliant search crawlers not to index the demo, but this is not an access-control mechanism.

In Render, create **New → Web Service** and connect the GitHub repository containing the `careprep_ai_v2_2` project folder. If the project is at the repository root, use:

- **Language:** Python 3
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 90`
- **Health check path:** `/healthz`

If the project folder is nested inside the repository, set Render's **Root Directory** to `careprep_ai_v2_2` and use the same build and start commands.

Add these environment variables in Render's Environment section (do not put the real key in GitHub):

```text
GROQ_API_KEY=your_actual_groq_key
GROQ_MODEL=openai/gpt-oss-20b
PYTHONUNBUFFERED=1
```

The included `Procfile` has the same port-aware Gunicorn command. The app exposes `/healthz` for a lightweight health check. The top-bar status means the Groq API key is configured; it does **not** prove that a live Groq request will succeed. After deployment, test one real AI question and one DailyMed label search.

**Free-plan note:** Render free web services spin down after 15 minutes without traffic; the first request after sleep can take about a minute to wake the service. Open and test the URL shortly before sending it to the recruiter, and mention the possible initial wake-up delay if you use the free plan.

Never commit `.env` or expose credentials in GitHub, screenshots, or a demonstration video. For this recruiter demo, keep the app limited to fictional, non-identifying examples. The browser's localStorage notes, checklist state, and reminder settings are not encrypted.

## Project structure

```text
careprep_ai_v2_2/
├── app.py
├── requirements.txt
├── .env.example
├── .gitignore
├── Procfile
├── README.md
├── PROMPT_DOCUMENTATION.md
├── VIDEO_PRESENTATION_SCRIPT.md
├── templates/
│   └── index.html
└── static/
    ├── app.js
    └── styles.css
```

## Assessment mapping

| Assessment criterion | Evidence to demonstrate |
|---|---|
| Healthcare domain | General health education and appointment preparation |
| Website development | Multi-page-feeling responsive Flask web app |
| Practical AI use | Groq-powered chat, multilingual output, question generation, structured visit notes, source-grounded prescription-label explanation |
| Prompt engineering | Shared safety prompt plus language, style, and workflow-specific instructions |
| Creativity and problem solving | Converts free-text topics and observations into usable preparation outputs; source-guided label explanations; safe missed-dose text handling; locally configured reminders |
| Technical execution | Flask endpoints, API integration, browser Markdown renderer, localStorage, print-to-PDF workflow |
| Demonstration | Live chat, language switch, question generator, visit-note draft, PDF export, checklist, notes dashboard |

## Pre-submission checklist

- [ ] Confirm the correct Groq key is configured locally and not committed.
- [ ] Test one assistant question in English, Kannada, and Hindi.
- [ ] Test Simple and More detailed response styles.
- [ ] Test the doctor question generator with fictional information.
- [ ] Generate a visit note and confirm Markdown is readable.
- [ ] Export a sample PDF using browser print-to-PDF.
- [ ] Check and reset checklist items.
- [ ] Create, search, edit, copy, download, and delete a local note.
- [ ] Test the UI at desktop and mobile widths.
- [ ] Replace any fictional test notes with blank state before recording.
- [ ] Update prompt documentation with exact prompts and real test observations.
- [ ] Record a two-minute or longer demonstration video.
- [ ] Deploy and verify the project link before emailing the company.
