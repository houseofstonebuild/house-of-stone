// The canonical review URL runs the same complete acceptance as the new study.
process.env.MABWE_STUDY_PATH='/prototypes/making-atelier.html';
process.env.MABWE_REVIEW_DEST='test-results/browser/welcome-film';
await import('./continuous-making-acceptance.mjs');
