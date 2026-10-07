# Requirement Quality Review

The front page for a free tool that helps Australian Government buyers check an RFQ, RFT or Statement of Requirements (SOR) before going to market. It scores every requirement for clarity, consistency, duplication, proportionality to value and risk, and accessibility for SMEs and new entrants. It also flags conflicts, gold-plating, unnecessary evidence requests, undefined terms and mandatory criteria not linked to a stated risk.

The reviewer itself is `requirement-review.html`. Claude only runs a published artifact for the account that created it, so each buyer downloads the file and asks Claude to make it an artifact in their own chat (a free account works). Their usage counts against their own plan.

The review engine is the requirement-review module from the Wayfinder procurement evaluation project, bundled into the artifact.
