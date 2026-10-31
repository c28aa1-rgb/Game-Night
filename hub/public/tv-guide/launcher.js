(() => {
  const game = location.pathname.split('/')[1];
  const themedGames = ['hitster', 'hues-cues', 'mafia', 'wavelength', 'chameleon', 'herd-mentality', 'codenames', 'draft', 'karaoke'];
  document.documentElement.dataset.tvGuideTheme = themedGames.includes(game) ? game : 'hub';
  let loading;
  function loadGuide() {
    if (!loading) {
      const styles = new Promise((resolve, reject) => {
        const existing = document.getElementById('gn-tv-guide-css');
        if (existing?.sheet) return resolve();
        const link = existing || document.createElement('link');
        link.id = 'gn-tv-guide-css';
        link.rel = 'stylesheet';
        link.href = '/hub/tv-guide/app/guide.css';
        link.onload = resolve;
        link.onerror = () => { link.remove(); reject(new Error('styles')); };
        if (!existing) document.head.append(link);
      });
      loading = Promise.all([import('/hub/tv-guide/app/guide.js'), styles])
        .then(([module]) => module).catch((error) => { loading = null; throw error; });
    }
    return loading;
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-tv-guide]');
    if (!button || button.getAttribute('aria-busy') === 'true') return;
    event.preventDefault();
    button.setAttribute('aria-busy', 'true');
    button.nextElementSibling?.classList.contains('gn-tv-error') && button.nextElementSibling.remove();
    try {
      const module = await loadGuide();
      module.openTVGuide(button);
    } catch {
      const error = document.createElement('span');
      error.className = 'gn-tv-error';
      error.setAttribute('role', 'status');
      error.textContent = 'The TV guide could not load. Check your connection and try again.';
      button.after(error);
    } finally {
      button.removeAttribute('aria-busy');
    }
  });
})();
