import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import UserJoinPage from './pages/UserJoinPage';
import AgentLogin from './pages/AgentLogin';
import AgentDashboard from './components/Dashboard/AgentDashboard';
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
          <Route path="/" element={<Navigate to="/agent/login" replace />} />
          <Route path="/join/:sessionId" element={<UserJoinPage />} />
          <Route path="/agent/login" element={<AgentLogin />} />
          <Route path="/agent/dashboard" element={<AgentDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;

