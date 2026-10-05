# House of Stone

The approved black website and Taper logo, with a private collection editor, enquiry inbox, and demand measurement. No external packages are required to run it.

## What is finished

- A full-width apartment hero, fixed header, normal-flow footer with site navigation, a modal side drawer, readable 15–16-pixel body typography, and the centered Taper mark.
- Artist-led collection chapters, aligned biographies, and sculpture cards with specifications, descriptions and detail links. The homepage also introduces designers, collectors, the making and the House.
- Complete sculpture, portrait and editorial image framing, responsive high-quality WebP delivery, and original-resolution uploads. The homepage hero fills the viewport with a responsive crop.
- Short, interruptible page and drawer animations, subtle scroll reveals, and reduced-motion support.
- A scroll-driven 3D sculpture panel, a full-screen viewer with drag, pinch, zoom and keyboard controls, and photo fallback when WebGL2 is unavailable. Mobile artist campaigns use a larger crop; sculpture and setting photos retain their full framing.
- Designer and collector interior editorials, artist biographies, and a fuller account of the House and its founders.
- A review and send enquiry flow with a real server, persistent storage, receipt reference, error handling, and safe retries.
- A password protected inbox at `/admin`, with enquiry and activity CSV exports.
- A demand dashboard for website sessions, collection clicks, work views, enquiry starts, submitted enquiries, campaign sources, and interest in individual works.
- Shareable artist and artwork addresses, page metadata, social previews, favicon, sitemap, and robots settings.
- A private editor at `/admin/content` for artists, sculptures, photos, ordering, archiving, and the homepage image. Save drafts, preview, publish, and restore earlier published versions.
- Privacy preferences, browser privacy signal handling, input limits, spam traps, request limits, and restricted access to private files.
- Optional email notifications with a durable retry queue. Enquiries reach the private inbox even when email is not configured or a notification fails.
- Docker packaging, Railway configuration, a GitHub checks workflow, persistent storage, and backup commands covering both the catalogue and uploaded photos.

## What still needs your account information

Hosting requires Node.js 24 with persistent storage, a public HTTPS address, and your private inbox password. Email notifications also need a sender address, recipient address or addresses, and a Resend API key. These are not required to run the website or save inquiries locally.

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

Sign in to `/admin/content`. Select a sculpture or artist, or choose **Add sculpture** or **Add artist**. Upload a JPEG, PNG, or WebP photo under 32 MB, or choose an existing image. There are no price fields. Sculpture details include title, artist, dimensions, stone type, optional year made, how the stone was acquired, and a description. Dates and sourcing details that have not been provided display as available on enquiry.

Use the up/down controls to change the order. **Homepage & site details** controls the hero photo, location and sharing description. The hero image is independent of sculpture photos. Adding several works under one artist automatically shows them below that artist on the homepage, collection and artist pages. Archiving hides a record from visitors while preserving its identifier and demand history. Archiving an artist also hides their sculptures.

Save your draft before leaving. Preview opens the saved draft in a private window with enquiries and demand measurement paused. Publish checks for missing photos, artist references, required sculpture details, duplicate addresses, and at least one visible sculpture. If another window saved changes first, the editor keeps your edits and asks you to reload rather than overwriting the newer version. Download your edits before reloading to retain a copy.

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

The Browser QA workflow runs Chromium, Firefox and WebKit against a fresh isolated server. It covers 18 public routes at eleven sizes from 320 × 568 to 3840 × 2160, including 2048-pixel monitor scaling and 3440-pixel ultrawide layouts, portrait and landscape, drawer layout and keyboard behavior, complete image decoding, real enquiries, lost confirmations and safe retries, privacy choices, session measurement, and actual owner editing, animation interruption and reduced-motion support. Screenshots and a JSON report are saved as a private seven-day workflow artifact. See the workflow result for the exact revision tested.

To run those browser checks locally, install the optional QA dependencies and browser binaries:

```sh
npm install --prefix qa
npx --prefix qa playwright install chromium firefox webkit
node qa/browser.mjs
```

This tests browser engines, rather than every physical device. Confirm optional email delivery with your real provider settings before launch. The Website checks workflow also builds the Docker image and checks production startup with a mounted data volume. Railway storage is attached through its service volume settings; the Dockerfile does not declare a Docker volume.

## Primary implementation references

- [Node.js 24.19 SQLite API](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html)
- [Node.js HTTP server API](https://nodejs.org/api/http.html)
- [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Agrippa Tirigu: Sculpting the stone](https://www.zimsculptures.com/sculpting-the-stone/) (background for the general process description)

The website uses Node.js 24's built-in SQLite module. The package targets Node.js 24.15 or newer within the 24 series, and the Dockerfile pins 24.19.0.

## Update an existing local installation

Stop the running server with Control-C. Copy the updated source files into your existing `house-of-stone-launch` folder, keeping your existing `.env` file and `data` folder. Those contain your login, collection edits, photos and enquiries. The update ZIP does not contain either of them. Run `npm start` again and hard-refresh the browser. Do not delete the database to apply a design update.

## Photography for launch

The included images now use the largest recovered originals, rather than the small files in the first package. The smallest master is 1122 pixels wide; the apartment hero is 1536 pixels wide and the making image is 1672 pixels wide. These are not native 4K photographs. Responsive WebP versions never enlarge them. Sculpture, portrait and editorial images remain complete; only the homepage hero uses a viewport-filling crop. The new interior images were created with the built-in image-generation tool using the approved sculptures as references; they show a refined New York apartment and a private home gallery.

For final photography, aim for 3840 pixels or more across a full-width hero or interior, and 2400 pixels or more across sculpture and portrait images. Keep the entire sculpture inside the photo with breathing room around the tip and base. Upload the highest-quality useful JPEG, PNG or WebP under 32 MB. Uploads retain the exact original bytes and resolution; the website cannot recover detail absent from a source photograph. Replace the sample artist biographies with approved factual biographies when the actual artists join the collection.

## 3D models

The five bundled GLB files now use traced contours, variable rounded depth, photographed stone surfaces, and the visible openings or recesses of each master image. Together has continuous heads and necks and its two narrow openings; Quiet Flight retains its curved neck and wing; Folded Light has full rounded cross sections along its turning ribbon; Continuum retains its asymmetric opening and pointed tip; Equilibrium has a dished circular recess with a solid back. These are reconstructions of generated images: the unpictured reverse surfaces and depth are inferred, rather than verified physical measurements. The public site retains the approved clean presentation.

`public/models.json` associates each model with its work ID, title and source photo. The viewer is hidden when that association no longer matches published content. Replace the corresponding `public/models/WORK-ID.glb` file and update the association when changing the sculpture. The bundled models use glTF 2.0 `KHR_mesh_quantization` and `KHR_materials_unlit`, and reference the existing local master JPEG without duplicating it. The viewer preserves the photographed front and blends larger source-stone samples over the inferred sides and reverse. `public/stone-surface.js` adds soft studio reflections from the smooth mesh normals across the entire visible surface, including openings. `stonePolish` controls their strength, with a subtler finish for Folded Light's pale stone. Reflections respond to rotation and viewing angle and require no extra textures, downloads or animation frames. For replacement models with their own materials, disable `referenceSurface` and `stoneGrain` and omit `referenceYaw`, `stoneSwatch` and `stonePolish`.

Offline authoring is in `scripts/model-review/`. `node scripts/build-models.mjs` rebuilds the assets and manifest using Python 3 with numpy, scipy and Pillow; these tools are not needed by the deployed server. Optional `--review /absolute/folder` writes mesh data and silhouette masks. `python3 scripts/model-review/render.py /absolute/folder --animation` creates reference comparisons and full rotations using Mesa/EGL. The authoring check verifies finite geometry, real depth and two incident triangles per mesh edge. Model tests also decode the quantized geometry with the actual GLTF loader and ray-test the openings and retained recess back. Browser QA decodes the real JPEG textures and compiles the actual viewer shaders.

The renderer and GLTF loader are vendored from Three.js r184 under its MIT license, recorded in `public/vendor/THREE-LICENSE.txt`. They load only when a 3D panel approaches the viewport or a visitor opens the viewer. Panels share one WebGL renderer and draw only on movement, resize or control input. Reduced motion stops scroll-driven rotation; manual controls still work. All modules and model files are served locally, with negotiated compression.

`model_view` records an explicit 3D viewer open, including browsers showing the fallback; `model_interaction` records the first manual control interaction in that opening. These are interest signals, not acquisitions. The dashboard counts distinct browser sessions for both, respecting existing privacy choices and private preview exclusions.

The browser workflow runs the three engines in parallel. Its artifacts are named `browser-qa-chromium`, `browser-qa-firefox`, and `browser-qa-webkit`. It checks actual meshes, scrolling in both directions, reduced motion, idle rendering, dialog controls, keyboard input, native Chromium touch pinch, and the non-WebGL fallback, in addition to the full page/layout and inquiry checks. Each rendered model has front, side and reverse screenshots; offline turntables use the same surface shader as the viewer. The geometry tests probe Folded Light's actual cross-section thickness rather than relying on overall bounds.

After a main-branch deployment, Live website verification waits for Railway to serve the exact model, manifest and viewer hashes. It then checks all public routes and the five live textured viewers at desktop and mobile sizes, including controls and inquiry-form opening. It disables measurement and submits no production inquiries. Screenshots and its report are retained as the `live-website-verification` workflow artifact.
