# Testcase Style Studio

A standalone browser app for generating QA testcases from requirements in a selected style, including Robert-style output.

## What It Does

- Accepts pasted requirements, user stories, acceptance criteria, permissions, and business rules.
- Supports OpenAI AI generation directly from the browser using your own API key.
- Keeps a local rule engine as a fallback when an API key is not provided or an API call fails.
- Generates output into the standard testcase columns:
  `TC ID`, `USER STORY ID`, `MODULE`, `Scenario`, `Test Case`, `Expected Result`, `Type`, `Status`.
- Supports Robert, Professional Standard, Yuv Broad Coverage, and Compact Review styles.
- Adds supported coverage such as positive, negative, UI, permission, functional, quick move, add child, and delete scenarios.
- Still includes an optional mode to rewrite existing testcase rows.
- Provides a generation summary showing requirement points, added coverage, duplicate removal, and final row counts.
- Exports CSV and copies TSV for Excel.

## AI Mode

Select `OpenAI AI generation`, enter an OpenAI API key, and generate. The app uses the Responses API with structured JSON output so the result can be rendered directly into testcase rows.

The API key is used only in your browser. If you enable `Remember key on this browser`, it is saved to local browser storage on that machine only. It is not committed to GitHub and there is no server-side storage in this app.

If no API key is entered, the app automatically falls back to the local rule engine.

## Run Locally

Open `index.html` directly in a browser, or run a simple local server:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Deploy To GitHub Pages

This repository includes `.github/workflows/pages.yml`.

After pushing to GitHub:

1. Open the repository on GitHub.
2. Go to `Settings > Pages`.
3. Select `GitHub Actions` as the source.
4. Push to `main`; GitHub Pages will deploy automatically.

## Notes

This app is intentionally browser-only. It does not send requirement or testcase data to any server and does not require an API key.
