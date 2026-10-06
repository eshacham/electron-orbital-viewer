import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import { applyState, bindUrlStateStore, registerBuiltInUrlKeys } from './url_state';
import { registerBondsUrlKeys } from './bonds/bonds_url';
import { registerMoleculeUrlKeys } from './molecules/url_keys';
import './style.css';

// Restore a shared view before the first render, so the app never draws a
// default view on its way to the linked one.
bindUrlStateStore(store);
registerBuiltInUrlKeys();
registerBondsUrlKeys();
registerMoleculeUrlKeys();
applyState(window.location.hash);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);