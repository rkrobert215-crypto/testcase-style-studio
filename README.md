# Testcase Style Studio

A standalone browser app for generating QA testcases from requirements in a selected style, including Robert-style output.

## What It Does

- Accepts pasted requirements, user stories, acceptance criteria, permissions, and business rules.
- Generates output into the standard testcase columns:
  `TC ID`, `USER STORY ID`, `MODULE`, `Scenario`, `Test Case`, `Expected Result`, `Type`, `Status`.
- Supports Robert, Professional Standard, Yuv Broad Coverage, and Compact Review styles.
- Adds supported coverage such as positive, negative, UI, permission, functional, quick move, add child, and delete scenarios.
- Still includes an optional mode to rewrite existing testcase rows.
- Provides a generation summary showing requirement points, added coverage, duplicate removal, and final row counts.
- Exports CSV and copies TSV for Excel.

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
