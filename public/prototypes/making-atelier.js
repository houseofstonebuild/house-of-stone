/* House of Mabwe — intentionally lightweight Welcome review.
   The story scrolls natively; the documentary only starts after a tap.
   This file does not import 3D, create frame atlases, read scrollY,
   seek video with scroll, or animate an off-screen canvas. */
(() => {
  'use strict';
  const film = document.getElementById('workshop-film');
  const frame = film?.closest('[data-film]');
  const play = frame?.querySelector('.film-play');
  if (!film || !frame || !play) return;

  let starting = false;
  const showPlay = (label) => {
    play.hidden = false;
    play.setAttribute('aria-label', label || 'Play workshop footage');
    frame.dataset.playing = 'false';
    film.controls = false;
  };
  const hidePlay = () => {
    play.hidden = true;
    frame.dataset.playing = 'true';
    film.controls = true;
  };
  const pauseVideo = () => {
    if (!film.paused) film.pause();
  };

  play.addEventListener('click', async () => {
    if (starting) return;
    starting = true;
    try {
      if (film.ended || film.currentTime >= (film.duration || Infinity) - .15) {
        film.currentTime = 0;
      }
      film.preload = 'metadata';
      const started = film.play();
      if (started && typeof started.then === 'function') await started;
      hidePlay();
    } catch (error) {
      showPlay('Retry workshop video');
      frame.dataset.videoError = 'true';
      console.warn('Workshop playback unavailable:', error);
    } finally {
      starting = false;
    }
  });

  film.addEventListener('ended', () => {
    pauseVideo();
    // Do not keep the last frame frozen and misleadingly labelled as Coil.
    try { film.currentTime = 0; } catch {}
    showPlay('Replay workshop footage');
  });
  film.addEventListener('error', () => {
    pauseVideo();
    showPlay('Retry workshop footage');
  });
  film.addEventListener('pause', () => {
    if (film.ended || !frame.isConnected) return;
    // The visitor may resume by using native controls; don't obscure them.
    frame.dataset.playing = 'false';
  });
  film.addEventListener('play', () => {
    hidePlay();
  });

  // Pause whenever the film is no longer visible instead of keeping
  // decoding while the visitor reads the other chapters.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio > .15)) pauseVideo();
    }, { threshold: [0, .15, .75] });
    observer.observe(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseVideo();
  });
})();
