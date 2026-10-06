import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import { applyState, bindUrlStateStore, registerBuiltInUrlKeys } from './url_state';
import { registerBondsUrlKeys } from './bonds/bonds_url';
import { registerMoleculeUrlKeys } from './molecules/url_keys';
import { registerComputedUrlKeys } from './jobs/url_keys';
import { bindJobsClient } from './jobs/client';
import { startOwnerSession } from './jobs/owner_session';
import './style.css';

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
      <App />
    </Provider>
  </React.StrictMode>,
);