# Requirement Quality Review

A free browser tool for Australian Government buyers. It reviews an RFQ, RFT or Statement of Requirements (SOR) one requirement at a time. Each requirement is scored for clarity, consistency, duplication, proportionality to value and risk, and accessibility for SMEs and new entrants. The tool also flags:

- conflicting requirements
- duplicated requirements
- gold-plating
- unnecessary evidence requests
- undefined terms
- mandatory criteria not linked to a stated risk

## How to use it

1. Open the site.
2. Add your documents (PDF, Word or text).
3. Enter the category, the estimated value and the risk.
4. Paste a free Gemini API key from https://aistudio.google.com/apikey.
5. Press **Review documents**, then download the report as Markdown or JSON.

## Privacy

Documents are read in your browser. Their text is sent only to Google's Gemini API, using your own key. On Google's free tier, Google may use what you send to improve its products. Only review documents already released to market. Never review anything classified or commercially sensitive.

## How it's built

The review engine (`engine.js`) is the requirement-review module from the Wayfinder procurement evaluation project, bundled for the browser. PDF text is read with Mozilla's pdf.js (`pdf.min.mjs`, `pdf.worker.min.mjs`, Apache-2.0).
