# Connect this chat to the website

There are two ways to update House of Stone:

| Change | Where it happens | How it goes live |
| --- | --- | --- |
| Sculpture photos, details, artists, order, archive status, featured work | Private collection editor at `/admin/content` | Publish changes; visitors see them on their next page load |
| Layout, typography, motion, navigation, general copy, features | Code changes requested in this chat | Tested changes reach the connected GitHub repository, then the hosting service deploys them |

Code and content stay separate. The database and uploaded photos live on a persistent hosting volume. A deployment replaces the application code while keeping that volume.

### Owner-authorized collection publication, 23 October 2026

This release includes a one-time publication of the full five-collection, 23-work renovation at the existing Railway origin. On production startup, `scripts/publish-owner-release.mjs` uses the authenticated, revision-checked content and publish endpoints over loopback. The previous catalogue remains in publication history; existing inquiries, events, uploaded media and record IDs remain intact. A persistent settings marker prevents later deployments from publishing drafts again. Other hosting origins do not run this release.

The owner has explicitly authorized public working titles, artist assignments, stone/dimension copy and the five source-matched reconstructions until the photoshoot arrives. The editor keeps these publication switches separate from factual verification. Availability remains unknown except the confirmed sold page 13. Provenance, signatures, sourcing and delivery claims still require verification. Replacing a sculpture photograph disables working-model publication as well as the normal model confirmation. After this one-time release, content publishing continues through the editor as usual.

## One-time setup

1. Create or choose a GitHub account, enable the GitHub connection here, and grant access to the repository for this website. A private repository named `house-of-stone` is a suitable choice. Put the contents of this folder at the repository root, including `.github/workflows/checks.yml`. Do not upload `.env`, `data`, or backups. This package's `.gitignore` excludes them.
2. Create or choose a Railway account. Create a project from that GitHub repository. Use the `main` branch for the public website. Railway reads the included Dockerfile and `railway.json`.
3. Attach a persistent volume to the website service at **`/app/data`**. Keep one service instance. The volume holds both SQLite and `media` and must remain attached during redeployments.
4. Set the following service variables. Generate the password privately; do not paste credentials into the chat.

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD` | A unique password of at least 16 characters |
| `SITE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}`, or the exact HTTPS origin generated for the service |
| `DATA_DIR` | `/app/data` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `ENABLE_INDEXING` | `false` until the collection is ready for search engines |
| `RAILWAY_RUN_UID` | `0`, as required by Railway for this image to write to its root-owned volume |
| `TRUST_PROXY` | `false`; change only after verifying the host replaces forwarded IP headers |

5. Generate a Railway public domain under the service networking settings, using the service's assigned port. If you used an exact `SITE_URL`, update it to that public HTTPS origin and deploy. A purchased domain is optional at this point. Keep one canonical address; the app's write endpoints check it against the browser origin.
6. Enable GitHub autodeploy and **Wait for CI** in the Railway service settings. The included workflow runs the content checks and tests on pushes to `main`. Wait for CI prevents a failed workflow from triggering a deployment.
7. Open the public site, `/admin`, and `/admin/content`. Use username `admin` and your private password. Make a small draft edit, preview it, publish it, then redeploy the same code and confirm the edit and uploaded photo remain present. Send a test enquiry and verify the saved receipt and inbox record.

Storage startup respects host-managed mount permissions when the data directory is writable. Database files remain private, and the existing database stays at the same path. If startup reports `DATA_DIR is not writable`, confirm the volume is mounted at `/app/data` and that `RAILWAY_RUN_UID=0` is saved and deployed on this service. Keep the existing volume attached.

The repository, hosting service, volume, and domain are not created by downloading this package. They must be connected in the respective accounts. Once GitHub access is confirmed here, continue with this exact repository rather than starting a second copy of the site.

## Future edits requested here

Ask for a change in plain language, such as “make the collection cards smaller on mobile” or “change the hero button to Explore the collection.” With access to the connected repository, I can make and test the change, update the repository, and check the resulting deployment. A change becomes public after it reaches `main`, passes the configured checks, and the host deploys successfully.

If an account connection or repository permission blocks a step, the change can still be prepared locally, but it is not live until the repository and host receive it. Changes made only to a ZIP or conversation preview do not update the public site automatically.

For sculpture content changes requested here, use the live collection editor or its authenticated API, preserving IDs. Changing `content/catalog.json` after launch does not change the database. Publishing content uses the same revision checks as the editor.

## Recover and back up

Keep a backup of the persistent volume. The package's `npm run backup` command saves the database plus a matching media directory; retain both. Configure the host's volume backup schedule in your account. Code rollback restores code only, and does not restore a prior collection; use **Published versions** in the editor for that.

This package uses one shared owner account. Separate Bradley/Milton sign-ins and roles can be added later. Uploaded photos are retained so older published versions can still be restored. Monitor volume usage as the photo collection grows.

## Official setup references

- [Railway GitHub autodeploy and Wait for CI](https://docs.railway.com/deployments/github-autodeploys)
- [Railway volumes and file permissions](https://docs.railway.com/volumes)
- [Railway public networking](https://docs.railway.com/networking/public-networking)
- [Railway config as code](https://docs.railway.com/config-as-code/reference)
- [GitHub checkout](https://github.com/actions/checkout) and [Node setup](https://github.com/actions/setup-node)
