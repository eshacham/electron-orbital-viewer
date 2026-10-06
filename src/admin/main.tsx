import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../store/jobsSlice';
import { bindJobsClient } from '../jobs/client';
import { startOwnerSession } from '../jobs/owner_session';
import AdminApp from './AdminApp';
import './admin.css';

// Its own small store: the dashboard needs the jobs state and nothing of the viewer's.
const store = configureStore({ reducer: { jobs: jobsReducer } });
bindJobsClient(store);
void startOwnerSession(store.dispatch, '/admin.html');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <AdminApp />
    </Provider>
  </React.StrictMode>,
);
