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
import { requiredLevel, readLevelParam } from './levels/required_level';
import { levelPref, raiseForVisit } from './levels/level_pref';
import { levelRank } from './levels/levels';

// The boot script in index.html has already migrated and applied the theme;
// this repeats the migration for a page served before the script existed.
try { migrateLegacyTheme(window.localStorage); } catch { /* storage refused: the pref keeps it in memory */ }

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
// Read `lvl` from the hash before applying it -- applyState never rewrites
// the hash itself, but capturing it first keeps this in step with
// useUrlStateSync's own onHashChange, which must (its debounced write does
// rewrite the hash, dropping `lvl`: it is never registered for writing,
// url_state.ts's encodeStateOf, so a link keeps the recipient's own level).
const bootHash = window.location.hash;
applyState(bootHash);
// The visit-only raise (spec plan): a linked `lvl`, or a value this state
// already holds that only a higher level's control can set, opens this
// visit at the higher of the two -- but only when that is actually above
// the viewer's own stored level; never lower it, and never write it back.
const bootRequired = requiredLevel(store.getState());
const bootLinked = readLevelParam(bootHash);
const bootTarget = bootLinked && levelRank(bootLinked) > levelRank(bootRequired) ? bootLinked : bootRequired;
if (levelRank(bootTarget) > levelRank(levelPref.get())) raiseForVisit(bootTarget);
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
