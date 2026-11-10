# Next Chapter

A job discovery dashboard with a private, cross-device application tracker.

- Public listings come from 13 employer Greenhouse, Lever and Ashby boards. Early-career and location filters are available. A source check does not guarantee employer legitimacy or eligibility.
- LinkedIn, Naukri, Indeed, Glassdoor, Google, Foundit and Wellfound are labelled search shortcuts, not imported feeds. Save any posting using **Add a job link**.
- **Track & open** saves the job and opens its application. It never records an application as submitted. Update Applied, Interview, Offer or Closed yourself.
- Supabase authentication and row-level security keep each user's jobs private. Sign in with the same account on another device. Changes sync on focus, every minute or with Sync now. Export is available for backups.
- No resume, candidate answers, Gmail credentials or browser sessions are deployed.

## Deployment

Vercel project: `next-chapter-jobs` in Abhiram's projects. Build with `npm ci` and `npm run build`; output is `site`. Only four explicit public artifacts are published. The Supabase publishable key is intentionally public. Never add a secret/service-role key here.

Public repository: [Abteeeen/next-chapter-jobs](https://github.com/Abteeeen/next-chapter-jobs). The Vercel frontend reads the daily feed at `https://abteeeen.github.io/next-chapter-jobs/jobs.json`, so daily updates do not require Vercel redeployments. The Pages workflow runs at 03:30 UTC / 09:00 IST daily, on push and on manual dispatch. GitHub may delay scheduled runs. Total source failure fails the workflow instead of replacing the feed. Partial failures and stale timestamps are shown.

Supabase project: `ybyfecibshwmqalyljiv`, Next Chapter Jobs, Mumbai, Abteeeen's Org. Owner-only SELECT/INSERT/UPDATE/DELETE policies compare `auth.uid()` to `user_id`. Anonymous privileges are revoked. Configure Auth Site URL and explicit redirect URLs for production and Pages; keep email confirmation enabled. The default email service restricts delivery, so verify the owner's confirmation email before claiming account setup is complete.

Free services have quotas and may pause inactive projects. No paid plan or optional paid feature should be enabled without the owner's approval.

## Local verification

```sh
python -m unittest test_feed.py
python fetch_jobs.py
npm ci
npm run build
python -m http.server 8766 --directory site
```

The private application agent remains in `Abteeeen/next-chapter-job-agent`. Publish only this directory's explicit source files into the public checkout. Never publish the parent directory or its private data, output, resume or environment files.
