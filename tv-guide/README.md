# Shared TV setup guide

Every game entry page loads /hub/tv-guide/launcher.css and the small deferred
launcher.js. Add a data-tv-guide attribute to a button to open the guide.
The React and Motion walkthrough downloads only when somebody opens it.

- Guide.jsx: accessible dialog, animated keyboard example, visual steps.
- data.js: platform detection, connection methods, and official help links.
- guide.css: isolated slate, white, and mint styling for every game.
- entry.jsx: mounts one guide and restores focus after it closes.

Run npm run build:tv-guide from the repository root after changing the guide.
The bundle and CSS are committed in hub/public/tv-guide/app/ for Render.
Regenerate the original PNG menu illustrations with
node tv-guide/build-illustrations.mjs. Their public location is
hub/public/tv-guide/illustrations/.

Karaoke's React buttons use the same delegated launcher. Rebuild Karaoke from
games/karaoke/source with npm run build, then copy dist/ into its static/
directory when changing those buttons or its HTML entry point.
