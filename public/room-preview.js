// These three heights were confirmed for the first room-preview release.
const confirmedHeights = Object.freeze({
  'hos-queen-mother': 45,
  'zsa-023': 156,
  'zsa-024': 43
});
function recordedHeight(work) {
  if (confirmedHeights[work?.id]) return confirmedHeights[work.id];
  const match = String(work?.dimensions || '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:×|x|cm\b)/i);
  const height = match ? Number(match[1]) : NaN;
  return height > 0 && height < 500 ? height : null;
}

const componentURL = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js';
let componentPromise;

export function roomPreviewEligible(work, model) {
  return Boolean(work && model?.file &&
    (!model.uploaded || model.ownerApproved === true) &&
    (model.workId ? model.workId === work.id : model.title === work.title));
}

export function initializeRoomPreview(root, onAR = () => {}) {
  const dialog = root.querySelector('#hos-ar-dialog');
  const stage = root.querySelector('#hos-ar-stage');
  const title = root.querySelector('#hos-ar-title');
  const status = root.querySelector('#hos-ar-status');
  const note = root.querySelector('#hos-ar-note');
  let opener, generation = 0;

  function close() { if (dialog.open) dialog.close(); }
  dialog.querySelector('[data-ar-close]').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }
  });
  dialog.addEventListener('close', () => {
    generation++;
    stage.replaceChildren();
    document.body.classList.remove('hos-ar-open');
    opener?.focus({preventScroll:true});
  });

  async function open(work, model, trigger) {
    if (!roomPreviewEligible(work, model)) return;
    if (dialog.open) close();
    opener = trigger;
    const request = ++generation;
    title.textContent = work.title;
    const knownHeight = recordedHeight(work);
    note.textContent = knownHeight
      ? 'Digital preview at the recorded height. The physical sculpture and its finish may vary from the model.'
      : 'Illustrative starting size; physical dimensions are on inquiry. Pinch in camera view to compare sizes.';
    status.textContent = 'Preparing the room preview…';
    stage.replaceChildren();
    dialog.showModal();
    document.body.classList.add('hos-ar-open');
    try {
      componentPromise ||= import(componentURL).catch(error => { componentPromise = null; throw error; });
      await componentPromise;
      await customElements.whenDefined('model-viewer');
      if (request !== generation || !dialog.open) return;
      // Uploaded sculpture GLBs use EXT_meshopt_compression. Configure the
      // decoder before model-viewer creates its internal GLTFLoader.
      customElements.get('model-viewer').meshoptDecoderLocation = new URL('/vendor/meshopt_decoder_classic.js', location.href).href;
      const viewer = document.createElement('model-viewer');
      viewer.className = 'hos-ar-viewer';
      viewer.setAttribute('src', model.file);
      const height = knownHeight || 40;
      viewer.setAttribute('alt', knownHeight ? `${work.title} at approximately ${height} centimetres high` : `${work.title} in an adjustable room preview`);
      viewer.setAttribute('ar', '');
      viewer.setAttribute('ar-modes', 'webxr quick-look');
      viewer.setAttribute('ar-scale', knownHeight ? 'fixed' : 'auto');
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('touch-action', 'pan-y');
      viewer.setAttribute('environment-image', 'neutral');
      viewer.setAttribute('shadow-intensity', '0.6');
      viewer.setAttribute('loading', 'eager');
      const place = document.createElement('button');
      place.type = 'button';
      place.slot = 'ar-button';
      place.className = 'hos-ar-place';
      place.textContent = 'Place in my room';
      place.disabled = true;
      place.addEventListener('click', () => onAR(work));
      viewer.append(place);
      const gesture = document.createElement('p');
      gesture.className = 'hos-ar-gesture-tip';
      gesture.textContent = 'Drag the sculpture to try another spot. Use two fingers to turn it.';
      viewer.append(gesture);
      viewer.addEventListener('load', () => {
        if (request !== generation) return;
        const dimensions = viewer.getDimensions();
        const modelHeight = dimensions?.y;
        if (!Number.isFinite(modelHeight) || modelHeight <= 0) {
          status.textContent = 'We could not verify this model’s scale. Explore the 3D view on the sculpture page instead.';
          return;
        }
        const factor = height / 100 / modelHeight;
        if (!Number.isFinite(factor) || factor <= 0 || factor > 1000) {
          status.textContent = 'We could not verify this model’s scale. Explore the 3D view on the sculpture page instead.';
          return;
        }
        viewer.scale = `${factor} ${factor} ${factor}`;
        viewer.updateFraming();
        place.disabled = false;
        status.textContent = knownHeight
          ? (viewer.canActivateAR
            ? `Shown at approximately ${height} cm high. In your room, drag the sculpture to compare different spots and use two fingers to turn it.`
            : `Shown at approximately ${height} cm high. Open this page on a supported phone to place and move it in your room.`)
          : 'Illustrative size. Drag to compare spots, and pinch to resize; ask us for the physical dimensions.';
      }, {once:true});
      viewer.addEventListener('error', event => {
        viewer.dataset.errorType = String(event.detail?.type || 'unknown');
        viewer.dataset.errorSource = String(event.detail?.source || '');
        if (request === generation) status.textContent = 'This model could not load. Please use the sculpture photographs or 3D view.';
      });
      viewer.addEventListener('ar-status', event => {
        if (request === generation && event.detail?.status === 'failed')
          status.textContent = 'Room placement could not start on this device. The 3D view remains available.';
      });
      stage.append(viewer);
    } catch {
      if (request === generation) status.textContent = 'The room preview could not load. Please try again or explore the 3D view.';
    }
  }
  return {open, close};
}
