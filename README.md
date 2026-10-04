# House of Stone

The approved black website and Taper logo, with a private collection editor, enquiry inbox, and demand measurement. No external packages are required to run it.

## What is finished

- A full-width responsive gallery with fixed header and footer, a modal side drawer, smaller thin typography, and the centered Taper mark.
- Complete image framing throughout, restored original images, responsive high-quality WebP delivery, and original-resolution uploads.
- Designer and collector interior editorials, artist biographies, and a fuller account of the House and its founders.
- A review and send enquiry flow with a real server, persistent storage, receipt reference, error handling, and safe retries.
- A password protected inbox at `/admin`, with enquiry and activity CSV exports.
- A demand dashboard for website sessions, collection clicks, work views, enquiry starts, submitted enquiries, campaign sources, and interest in individual works.
- Shareable artist and artwork addresses, page metadata, social previews, favicon, sitemap, and robots settings.
- A private editor at `/admin/content` for artists, sculptures, photos, ordering, archiving, and the homepage featured work. Save drafts, preview, publish, and restore earlier published versions.
- Privacy preferences, browser privacy signal handling, input limits, spam traps, request limits, and restricted access to private files.
- Optional email notifications with a durable retry queue. Enquiries reach the private inbox even when email is not configured or a notification fails.
- Docker packaging, Railway configuration, a GitHub checks workflow, persistent storage, and backup commands covering both the catalogue and uploaded photos.

## What still needs your account information

This package has not been published to a public address. It needs a hosting service that can run Node.js 24 with persistent storage, a public HTTPS address, and your private inbox password. Email notifications also need a sender address, recipient address or addresses, and a Resend API key. These are not required to run the website or save enquiries locally.

The existing images and sample artist records are retained. The website does not display development labels. Search indexing is off until you enable it for the real public collection.

## Open it locally

Install [Node.js 24](https://nodejs.org/en/download), unzip this package, and open a terminal in this folder:

```sh
npm run setup
npm start
```

Visit `http://localhost:8000`. Open `http://localhost:8000/admin` to view the inbox and analytics. The username is `admin`; setup prints your generated password and saves it privately in `.env`. On a Mac, `start.command` runs the same setup and server.

Open `http://localhost:8000/admin/content` to manage the collection with the same sign-in. Use **Save draft**, **Preview draft**, and **Publish changes**. A saved draft does not change the public website. Publishing updates the catalogue immediately on the server; visitors see the new version when they next load the site. Preview visits do not record demand activity or submit enquiries.

There is no `npm install` step. Keep the terminal open while using the website. Opening `public/index.html` directly will not run the enquiry server.

The local server listens only on your own computer. Local tests do not create a public website or send emails.

## Publish it

Use the included Dockerfile on a hosting service with HTTPS and a persistent disk. Set:

| Setting | Value |
| --- | --- |
| `ADMIN_PASSWORD` | A unique private password of at least 16 characters |
| `SITE_URL` | The exact public HTTPS origin, such as `https://your-domain.example` |
| `HOST` | `0.0.0.0` |
| `PORT` | The hosting service's assigned port, or `8000` |
| `DATA_DIR` | The persistent disk mount path; `/app/data` in the container |
| `NODE_ENV` | `production` |
| `ENABLE_INDEXING` | `false` until ready; then `true` |
| `TRUST_PROXY` | Leave `false` unless the service uses a trusted proxy that replaces `X-Forwarded-For` |

Run one website instance with this SQLite database. The included `compose.yaml` uses a named volume and binds the application to local port 8000 for use behind an HTTPS reverse proxy. Keep `/admin` accessible only over HTTPS. The health check is `/health`.

The persistent disk is essential: it stores enquiries, published content, drafts, version history, and uploaded photos. Do not publish `.env`, the data folder, or database backups. The Dockerfile excludes them and serves only public website files and approved uploaded image formats.

For the step-by-step GitHub and Railway setup, see [DEPLOYMENT.md](DEPLOYMENT.md). This connects future code changes from this chat to the live site after the accounts and repository are connected. No repository or hosting account has been connected by this package alone.

After deploying, open a sculpture directly by its `/works/...` address, send a test enquiry, check its reference in `/admin`, and verify that your visit and work view appear in the dashboard. Delete your own test enquiry with the removal command below. Real artwork content can be updated independently of these functions.

## Email notifications

In your hosting service's environment settings, add:

```text
RESEND_API_KEY=your_private_api_key
INQUIRY_EMAIL_FROM=House of Stone <your_verified_sender_address>
INQUIRY_EMAIL_TO=your_inbox_address
```

Use comma separated recipient addresses if you want both founders notified. Verify the sending domain in your Resend account. Keep the API key on the server. It is never included in the public website.

Notifications are sent to the founders, with the visitor's email as Reply-To. The website does not send the visitor a separate confirmation email. It confirms receipt on screen after saving the enquiry. Notification status means the email provider accepted the notification, rather than guaranteeing delivery to the mailbox.

Failures retry up to five times. The enquiry remains in the inbox throughout. After fixing a notification setting, queue one failed or inbox-only notification by its exact reference:

```sh
npm run retry-notification -- EXACT_ENQUIRY_REFERENCE
```

The server uses the enquiry reference as the notification idempotency key. Resend's key protection lasts 24 hours, so a manual retry after that period can produce another notification if an earlier attempt was accepted without a recorded response.

## Update sculptures and artists

Sign in to `/admin/content`. Select a sculpture or artist, or choose **Add sculpture** or **Add artist**. Upload a JPEG, PNG, or WebP photo under 32 MB, or choose an existing image. There are no price fields. Sculpture details include title, artist, dimensions, stone type, how the stone was acquired, and a description.

Use the up/down controls to change the order. **Homepage & site details** controls the featured sculpture and hero photo. Adding several works under one artist automatically shows them on the collection and artist pages. Archiving hides a record from visitors while preserving its identifier and demand history. Archiving an artist also hides their sculptures.

Save your draft before leaving. Preview opens the saved draft in a private window with enquiries and demand measurement paused. Publish checks for missing photos, artist references, required sculpture details, duplicate addresses, and a visible featured sculpture. If another window saved changes first, the editor keeps your edits and asks you to reload rather than overwriting the newer version. Download your edits before reloading to retain a copy.

Published versions can be restored into a draft and then published again. Restore also retains newer records as archived, keeping their identifiers. There is one shared `admin` account for both founders in this version, with no separate user permissions or per-person audit trail.

The initial collection lives in `content/catalog.json`. It is used only when creating a database for the first time. After that, the persistent database owns the collection. Editing that seed file or deploying new code does not overwrite the live collection. For live artist or sculpture changes, use the editor or its authenticated endpoints. Basic layout and other landing-page copy live in `public/index.html`, `styles.css`, and `app.js`.

The header logo is `public/assets/logo.png`. The full resolution transparent Taper master is in `brand/house-of-stone-taper-logo.png`. Keep record IDs stable when correcting the same work. Use **Add sculpture** for a different work. Page addresses use lowercase letters, numbers, and hyphens; changing one makes the old address unavailable.

## Measure demand

The public site records these activity names:

| Event | Trigger |
| --- | --- |
| `page_view` | A page or artist/work address is opened |
| `explore_click` | A visitor clicks a control leading to the collection |
| `artist_view` | An artist profile is opened |
| `work_view` | An individual work is opened |
| `inquiry_opened` | A visitor opens the enquiry form |
| `inquiry_started` | A visitor begins entering details |
| `inquiry_submitted` | The server saves an enquiry successfully |

Sessions use a random ID for one browser tab session. They are not verified unique people. Collection clicks are interest signals; specific enquiries are stronger demand evidence. No purchase conversion is claimed. Visitors can skip steps, revisit, block measurement, or arrive as bots. The inbox total includes enquiries from people who opted out of measurement; the measured funnel does not.

For campaign links, add `utm_source`, `utm_medium`, and `utm_campaign` to your public address. For example:

```text
https://your-domain.example/?utm_source=designer-outreach&utm_medium=personal-link&utm_campaign=founding-collection
```

Campaign attribution is kept for the browser session. Unrelated query parameters are ignored. Activity records contain hashed session identifiers and catalogue identifiers, with no name, email, or message fields. The private enquiry itself includes the details supplied by the visitor. IP addresses are not stored; temporary hashed identifiers support rate limiting. Activity records expire after one year.

## Keep enquiries safe

Back up the live database with the server running:

```sh
npm run backup
```

The SQLite backup API creates a consistent database copy under `data/backups/`, with uploaded photos in a matching `-media` folder. Keep both together in private storage outside the public website. To restore with the server stopped, replace the live database and its `media` folder from the same backup pair, then restart. This package does not configure scheduled backups.

To remove a specific enquiry and its associated session activity from the live database:

```sh
npm run remove-enquiry -- EXACT_ENQUIRY_REFERENCE --confirm
```

The removal command does not delete existing backup copies or notification emails; review those separately. The enquiry inbox is read only apart from downloading CSV files; the collection editor writes drafts and publishes content.

## Verification

```sh
npm run check
npm test
```

The automated tests exercise the real HTTP server and SQLite database, including persistence, privacy signals, idempotent submissions, rejected requests, access control, exports, campaign attribution, simulated email failures, draft isolation, publication, concurrency, image uploads, archiving, version restoration, and backups. Small DOM adapters run the actual visitor and editor scripts through their key interaction and network states.

The Browser QA workflow runs Chromium, Firefox and WebKit against a fresh isolated server. It covers 18 public routes at eight sizes from 320 × 568 to 2560 × 1440, portrait and landscape, drawer layout and keyboard behavior, complete image decoding, real enquiries, lost confirmations and safe retries, privacy choices, session measurement, and actual owner editing. Screenshots and a JSON report are saved as a private seven-day workflow artifact. See the workflow result for the exact revision tested.

To run those browser checks locally, install the optional QA dependencies and browser binaries:

```sh
npm install --prefix qa
npx --prefix qa playwright install chromium firefox webkit
node qa/browser.mjs
```

This tests browser engines, rather than every physical device. Confirm optional email delivery with your real provider settings before launch. The Docker image was prepared but not built in this environment.

## Primary implementation references

- [Node.js 24.19 SQLite API](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html)
- [Node.js HTTP server API](https://nodejs.org/api/http.html)
- [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)

The website uses Node.js 24's built-in SQLite module. The package targets Node.js 24.15 or newer within the 24 series, and the Dockerfile pins 24.19.0.

## Update an existing local installation

Stop the running server with Control-C. Copy the updated source files into your existing `house-of-stone-launch` folder, keeping your existing `.env` file and `data` folder. Those contain your login, collection edits, photos and enquiries. The update ZIP does not contain either of them. Run `npm start` again and hard-refresh the browser. Do not delete the database to apply a design update.

## Photography for launch

The included images now use the largest recovered originals, rather than the small files in the first package. The smallest master is 1122 pixels wide; hero and making images are 1672 pixels wide. These are not native 4K photographs. Responsive WebP versions never enlarge them, and no CSS image frame crops them. The new interior images were created with the built-in image-generation tool using the approved sculptures as references; they show a refined New York apartment and a private home gallery.

For final photography, aim for 3840 pixels or more across a full-width hero or interior, and 2400 pixels or more across sculpture and portrait images. Keep the entire sculpture inside the photo with breathing room around the tip and base. Upload the highest-quality useful JPEG, PNG or WebP under 32 MB. Uploads retain the exact original bytes and resolution; the website cannot recover detail absent from a source photograph. Replace the sample artist biographies with approved factual biographies when the actual artists join the collection.
