# House of Stone

Preserve the owner-approved white gallery canvas, charcoal Manrope typography with distinct title/body/caption scales, white hero text over the photograph, compact centered Taper face logo, and inquiry-only acquisition flow. Collection cards use photographs, linked titles and artist credits; details belong on work pages. Motion is restrained and respects reduced-motion preferences. No prices or checkout. No public concept, generated-image, or placeholder labels.

Use `npm run check` and `npm test` for changes to application behavior. The project uses Node 24 built-ins with no package installation. The Dockerfile must copy any new server-side module.

The live collection is owned by SQLite in the hosting service's persistent `DATA_DIR`, alongside uploaded `media`. `content/catalog.json` seeds new databases only. Never reset or replace the production database during code edits or deployment. Update live content through the authenticated collection endpoints or editor. Preserve existing artist/work IDs; archive instead of removing records. Writes require the current revision. Draft preview must remain private and excluded from enquiries and analytics.

Once connected, this repository is the canonical code source. Publish code through its configured main-branch deployment and inspect checks and deployment state. Do not claim a local ZIP or conversation preview updated the live site. Do not commit secrets, enquiry records, uploaded media, or database backups. Deployment details are in DEPLOYMENT.md.


