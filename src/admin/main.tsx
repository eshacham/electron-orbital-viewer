import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../store/jobsSlice';
import { bindJobsClient } from '../jobs/client';
import { startOwnerSession } from '../jobs/owner_session';
import AdminApp from './AdminApp';
import '@fontsource-variable/inter';
import '../design/tokens.css';
import '../design/design.css';
import { migrateLegacyTheme } from '../design/theme_storage';
import './admin.css';

// Its own small store: the dashboard needs the jobs state and nothing of the viewer's.
const store = configureStore({ reducer: { jobs: jobsReducer } });
bindJobsClient(store);
void startOwnerSession(store.dispatch, '/admin.html');

// The boot script in admin.html has already migrated and applied the theme;
// this repeats the migration for a page served before the script existed.
try { migrateLegacyTheme(window.localStorage); } catch { /* in memory */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <AdminApp />
    </Provider>
  </React.StrictMode>,
);
