# Requirement Quality Review

The front page for a free tool that helps Australian Government buyers check an RFQ, RFT or Statement of Requirements (SOR) before going to market. It scores every requirement for clarity, consistency, duplication, proportionality to value and risk, and accessibility for SMEs and new entrants. It also flags conflicts, gold-plating, unnecessary evidence requests, undefined terms and mandatory criteria not linked to a stated risk.

The reviewer itself is a Claude-powered artifact published on claude.ai. Buyers sign in with their own Claude account (a free one works), and their usage counts against their own plan. This page links to it through `REVIEWER_URL` in `index.html`.

The review engine is the requirement-review module from the Wayfinder procurement evaluation project, bundled into the artifact.
