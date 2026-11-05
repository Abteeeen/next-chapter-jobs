# Next Chapter public jobs

Published at https://abteeeen.github.io/next-chapter-jobs/ from the separate public repository Abteeeen/next-chapter-jobs.

The scheduled workflow runs at 03:30 UTC (09:00 IST) daily and on push/manual dispatch. GitHub may delay scheduled runs. It fetches live public employer-board APIs and publishes only index.html, style.css, app.js and jobs.json. It fails rather than replacing the feed when every source fails. Partial failures and stale feed timestamps are displayed.

No candidate data, credentials, resume, mailbox alerts, application history or private agent code belongs in this repository or Pages artifact. The private agent is maintained separately in Abteeeen/next-chapter-job-agent. This static website opens source postings; it cannot run a private browser worker or connect Gmail by itself.

To publish changes, copy only the files inside public_portal and its .github/workflows/pages.yml to the separate public checkout. Never publish the parent project directory.
