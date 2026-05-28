import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import UserJoinPage from './pages/UserJoinPage';
import InvestigatorLogin from './pages/InvestigatorLogin';
import InvestigatorDashboard from './components/Dashboard/InvestigatorDashboard';
import AdminPanel from './pages/AdminPanel';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/investigator/login" replace />} />
          <Route path="/join/*" element={<UserJoinPage />} />
          <Route path="/investigator/login" element={<InvestigatorLogin />} />
          <Route path="/investigator/dashboard" element={<InvestigatorDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;

