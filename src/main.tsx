import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource-variable/inter';
import './design/tokens.css';
import './design/design.css';
import './style.css';
import { store } from './store';
import App from './App';
import { applyState, bindUrlStateStore, registerBuiltInUrlKeys } from './url_state';
import { registerBondsUrlKeys } from './bonds/bonds_url';
import { registerMoleculeUrlKeys } from './molecules/url_keys';
import { registerComputedUrlKeys } from './jobs/url_keys';
import { bindJobsClient } from './jobs/client';
import { startOwnerSession } from './jobs/owner_session';
import { migrateLegacyTheme } from './design/theme_storage';
import { useQuantumTheme } from './design/useQuantumTheme';
import { BUILD_ENV } from './jobs/build_env';
import { applyDevBrandParam } from './design/brands';

// The boot script in index.html has already migrated and applied the theme;
// this repeats the migration for a page served before the script existed.
try { migrateLegacyTheme(window.localStorage); } catch { /* storage refused: the pref keeps it in memory */ }
applyDevBrandParam(window.location.search, BUILD_ENV.dev);

/** The theme lives here, above App, so a theme change never remounts the viewer (spec §3.2). */
function Root() {
  const { theme } = useQuantumTheme();
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

// Restore a shared view before the first render, so the app never draws a
// default view on its way to the linked one.
bindUrlStateStore(store);
bindJobsClient(store);
registerBuiltInUrlKeys();
registerBondsUrlKeys();
registerMoleculeUrlKeys();
registerComputedUrlKeys();
applyState(window.location.hash);
// Back from Cognito: the view the owner left travelled in the sign-in state (its hash); restore it.
// The exchange is a network round trip, so the default view shows until it
// answers (preflight D23, accepted): holding the first render back instead
// would leave a blank page for as long as Cognito takes, or for ever.
void startOwnerSession(store.dispatch, '/').then(back => {
  if (back) applyState(new URL(back, window.location.origin).hash);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <Root />
    </Provider>
  </React.StrictMode>,
);
