import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import {
  Download,
  Logout,
  Refresh,
  PictureAsPdf,
  TableChart,
  Add,
  PersonAdd,
  People,
  Upload,
  PlayArrow,
  ContentCopy,
  CheckCircle,
} from '@mui/icons-material';
import api from '../services/api';

const DOCUMENT_TYPE_LABELS = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  passport: 'Passport',
  user_photo: 'User Photo',
  other: 'Other',
};
const getDocumentTypeLabel = (type) => DOCUMENT_TYPE_LABELS[type] || (type || 'Document');

const AdminPanel = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
  });
  const [openDialog, setOpenDialog] = useState(false);
  const [newSession, setNewSession] = useState({
    userName: '',
    userPhone: '',
    userEmail: '',
    agentId: '', // Selected investigator ID
  });
  const [countryCode, setCountryCode] = useState('+91');
  const [validationErrors, setValidationErrors] = useState({
    userPhone: '',
    userEmail: '',
  });
  // Investigator management state
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [openAgentDialog, setOpenAgentDialog] = useState(false);
  const [newAgent, setNewAgent] = useState({
    username: '',
    password: '',
    fullName: '',
  });
  const [agentErrors, setAgentErrors] = useState({
    username: '',
    password: '',
  });
  const [agentSuccess, setAgentSuccess] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  // Bulk upload state
  const [bulkPendingSessions, setBulkPendingSessions] = useState([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [showResultDialog, setShowResultDialog] = useState(false);
  /** After creating a session: show centered dialog instead of window.alert */
  const [sessionCreatedSuccess, setSessionCreatedSuccess] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Common country codes
  const countryCodes = [
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
    { code: '+44', country: 'UK', flag: '🇬🇧' },
    { code: '+971', country: 'UAE', flag: '🇦🇪' },
    { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
    { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
    { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
    { code: '+61', country: 'Australia', flag: '🇦🇺' },
    { code: '+86', country: 'China', flag: '🇨🇳' },
  ];
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [openDetailsDialog, setOpenDetailsDialog] = useState(false);
  const [openRejectDialog, setOpenRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Check authentication and admin role on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
      navigate('/investigator/login');
      return;
    }
    
    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'admin') {
        // Not an admin, redirect to investigator dashboard or login
        navigate('/investigator/dashboard');
        return;
      }
      
      // Load initial data based on active tab
      console.log('🚀 [INIT] Component mounted, activeTab:', activeTab);
      if (activeTab === 2) {
        console.log('🚀 [INIT] Loading bulk pending on mount...');
        loadBulkPendingSessions();
      }
    } catch (err) {
      console.error('Error parsing user data:', err);
      navigate('/investigator/login');
      return;
    }
  }, [navigate]);

  // Load sessions when filters change (only if authenticated)
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          console.log('🔄 [useEffect] Active tab:', activeTab);
          if (activeTab === 0) {
            console.log('📋 Loading sessions...');
            loadSessions();
          } else if (activeTab === 1) {
            console.log('👥 Loading agents...');
            loadAgents();
          } else if (activeTab === 2) {
            console.log('📦 [BULK PENDING TAB] Active - Loading bulk pending sessions...');
            loadBulkPendingSessions();
          }
        }
      } catch (err) {
        console.error('Error parsing user data:', err);
      }
    } else {
      console.warn('⚠️ No token or user found');
    }
  }, [filters, activeTab]);

  // Load agents when create session dialog opens
  useEffect(() => {
    if (openDialog) {
      loadAgents();
    }
  }, [openDialog]);

  const loadSessions = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.get(`/sessions?${params.toString()}`);
      // Filter out pending_bulk sessions from main sessions tab (they show in BULK PENDING tab)
      const filteredSessions = (response.data.sessions || []).filter(
        session => session.status !== 'pending_bulk'
      );
      setSessions(filteredSessions);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setLoading(false);
    }
  };

  const handleExportPDF = async (sessionId) => {
    try {
      // Show loading message
      const loadingMessage = `Generating PDF for session ${sessionId}...`;
      console.log(loadingMessage);
      
      const response = await api.get(`/export/pdf/${sessionId}`, {
        responseType: 'blob',
      });

      // Check if response is actually a PDF
      if (response.data && response.data.size > 0) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `kyc-report-${sessionId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Clean up the URL after a delay
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
        alert('PDF downloaded successfully!');
      } else {
        throw new Error('PDF file is empty');
      }
    } catch (err) {
      console.error('Failed to export PDF:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to export PDF';
      alert(`Error: ${errorMessage}\n\nPlease check:\n1. Session exists in database\n2. Backend is running\n3. Check browser console for details`);
    }
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.get(`/export/excel?${params.toString()}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'kyc-sessions-export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export Excel:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/investigator/login');
  };

  // Bulk upload functions
  const loadBulkPendingSessions = async () => {
    try {
      console.log('📥 [BULK PENDING] Fetching bulk pending sessions from /sessions/bulk-pending...');
      const response = await api.get('/sessions/bulk-pending');
      console.log('✅ [BULK PENDING] Full response object:', response);
      console.log('✅ [BULK PENDING] Response data:', response.data);
      console.log('✅ [BULK PENDING] Sessions array:', response.data?.sessions);
      console.log('📊 [BULK PENDING] Sessions count:', response.data?.sessions?.length || 0);
      console.log('📊 [BULK PENDING] Response success:', response.data?.success);
      
      const sessions = response.data?.sessions || response.data || [];
      console.log('📋 [BULK PENDING] Setting sessions state with', sessions.length, 'records');
      console.log('📋 [BULK PENDING] First record:', sessions[0]);
      setBulkPendingSessions(sessions);
      
      if (sessions.length === 0) {
        console.warn('⚠️ [BULK PENDING] No bulk pending sessions found in response');
      } else {
        console.log('✅ [BULK PENDING] Successfully loaded', sessions.length, 'records');
      }
    } catch (err) {
      console.error('❌ [BULK PENDING] Failed to load bulk pending sessions:', err);
      console.error('❌ [BULK PENDING] Error response:', err.response);
      console.error('❌ [BULK PENDING] Error data:', err.response?.data);
      console.error('❌ [BULK PENDING] Error message:', err.message);
      console.error('❌ [BULK PENDING] Error stack:', err.stack);
      setBulkPendingSessions([]);
    }
  };

  const handleBulkUpload = async () => {
    if (!uploadFile) {
      alert('Please select a CSV or Excel file');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await api.post('/sessions/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Store result and show in dialog
      setUploadResult({
        created: response.data.created,
        errors: response.data.errors,
        errorDetails: response.data.errorDetails || [],
        message: response.data.message || `✅ Successfully stored ${response.data.created} record(s) in Bulk Pending!`
      });
      setShowUploadDialog(false);
      setUploadFile(null);
      setShowResultDialog(true);
      loadBulkPendingSessions();
    } catch (err) {
      console.error('Bulk upload error:', err);
      alert('Failed to upload file: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleStartSession = async (session) => {
    try {
      // Use id instead of session_id since bulk_upload_data doesn't have session_id
      const recordId = session.id || session.session_id;
      const response = await api.post(`/sessions/${recordId}/start-from-pending`);
      
      if (response.data.success) {
        const smsStatus = response.data.smsSent ? '✅ SMS sent successfully' : '⚠️ SMS failed';
        alert(`✅ Session created successfully!\n\n${smsStatus}\nUser: ${session.user_name}\nPhone: ${session.user_phone}\n\nSession will now appear in SESSIONS tab.`);
        loadBulkPendingSessions(); // Refresh bulk pending tab (session will be removed)
        loadSessions(); // Refresh sessions tab (session will appear here)
      }
    } catch (err) {
      console.error('Start session error:', err);
      alert('Failed to create session: ' + (err.response?.data?.error || err.message));
    }
  };

  /** Keep only digits; cap length so user cannot paste huge numbers (India = 10). */
  const sanitizePhoneInput = (raw, code) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (code === '+91') {
      return digits.slice(0, 10);
    }
    return digits.slice(0, 15);
  };

  // Validate mobile number based on country code
  const validatePhone = (phone, code) => {
    if (!phone || phone.trim() === '') {
      return 'Mobile number required hai';
    }
    // Remove spaces and special characters for validation
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // India (+91) validation
    if (code === '+91') {
    // Check if it starts with 0
    if (cleanPhone.startsWith('0')) {
      const digits = cleanPhone.substring(1);
      if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
        return '';
      }
        return 'Invalid mobile number. 10-digit Indian mobile number enter karein (6-9 se start hona chahiye)';
    }
    // Check if it's a 10-digit number starting with 6-9
    if (cleanPhone.length === 10 && /^[6-9]\d{9}$/.test(cleanPhone)) {
      return '';
    }
      return 'Invalid mobile number. 10-digit Indian mobile number enter karein (6-9 se start hona chahiye)';
    }
    
    // Other countries - basic validation (7-15 digits)
    if (cleanPhone.length >= 7 && cleanPhone.length <= 15 && /^\d+$/.test(cleanPhone)) {
      return '';
    }
    return 'Invalid mobile number. 7-15 digits required';
  };

  // Validate email
  const validateEmail = (email) => {
    if (!email || email.trim() === '') {
      return ''; // Email is optional
    }
    // More strict email validation regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const trimmedEmail = email.trim();
    
    // Check basic format
    if (!emailRegex.test(trimmedEmail)) {
      return 'Invalid email address. Valid email enter karein (e.g., user@example.com)';
    }
    
    // Check for consecutive dots
    if (trimmedEmail.includes('..')) {
      return 'Invalid email address. Consecutive dots not allowed';
    }
    
    // Check if @ symbol exists and is not at start or end
    const atIndex = trimmedEmail.indexOf('@');
    if (atIndex <= 0 || atIndex >= trimmedEmail.length - 1) {
      return 'Invalid email address. Valid email enter karein (e.g., user@example.com)';
    }
    
    // Check domain part
    const domain = trimmedEmail.split('@')[1];
    if (!domain || domain.length < 3 || !domain.includes('.')) {
      return 'Invalid email address. Domain invalid hai';
    }
    
    return '';
  };

  const handleCreateSession = async () => {
    // Validate phone number with country code
    const phoneError = validatePhone(newSession.userPhone, countryCode);
    const emailError = validateEmail(newSession.userEmail);
    
    setValidationErrors({
      userPhone: phoneError,
      userEmail: emailError,
    });

    // If there are validation errors, don't submit
    if (phoneError || emailError) {
      return;
    }

    try {
      // Combine country code with phone number
      const fullPhoneNumber = countryCode + newSession.userPhone.replace(/^0+/, '');
      const sessionData = {
        userName: newSession.userName,
        userPhone: fullPhoneNumber,
        userEmail: newSession.userEmail || undefined,
        // Send agentId only if selected (empty string means unassigned)
        agentId: newSession.agentId || null,
      };
      
      const response = await api.post('/sessions', sessionData);
      setSessionCreatedSuccess({
        joinLink: response.data.session.join_link,
        smsSent: response.data.smsSent,
        smsError: response.data.smsError || null,
        smsWarning: response.data.smsWarning || null,
        emailSent: response.data.emailSent,
        emailError: response.data.emailError || null,
      });
      setLinkCopied(false);
      setOpenDialog(false);
      setNewSession({ userName: '', userPhone: '', userEmail: '', agentId: '' });
      setCountryCode('+91');
      setValidationErrors({ userPhone: '', userEmail: '' });
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCopySessionJoinLink = async () => {
    if (!sessionCreatedSuccess?.joinLink) return;
    try {
      await navigator.clipboard.writeText(sessionCreatedSuccess.joinLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  };

  const handleViewSession = async (session) => {
    try {
      const response = await api.get(`/sessions/${session.session_id}`);
      const sessionData = response.data.session;
      
      // Get documents for this session
      let documents = [];
      try {
        const docsResponse = await api.get(`/kyc/documents?sessionId=${session.session_id}`);
        documents = docsResponse.data.documents || [];
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
      
      // Get video recordings for this session
      let recordings = [];
      try {
        const recordingsResponse = await api.get(`/kyc/recordings?sessionId=${session.session_id}`);
        recordings = recordingsResponse.data.recordings || [];
      } catch (err) {
        console.error('Failed to load recordings:', err);
      }
      
      setSessionDetails({ ...sessionData, documents, recordings });
      setSelectedSession(session);
      setOpenDetailsDialog(true);
    } catch (err) {
      alert('Failed to load session details: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleApprove = async () => {
    if (!selectedSession) return;
    try {
      await api.put(`/sessions/${selectedSession.session_id}/status`, {
        status: 'completed',
        notes: 'Approved by admin',
      });
      
      // Reload session details to get updated documents status
      if (selectedSession) {
        await handleViewSession(selectedSession);
      }
      
      alert('Session approved! All documents marked as verified.');
      loadSessions();
    } catch (err) {
      alert('Failed to approve: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleReject = () => {
    // Open reject reason dialog
    setOpenRejectDialog(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedSession) return;
    if (!rejectReason.trim()) {
      alert('Please provide a reject reason');
      return;
    }
    try {
      await api.put(`/sessions/${selectedSession.session_id}/status`, {
        status: 'rejected',
        notes: `Rejected by admin. Reason: ${rejectReason.trim()}`,
      });
      
      setOpenRejectDialog(false);
      setRejectReason('');
      
      // Reload session details to get updated documents status
      if (selectedSession) {
        await handleViewSession(selectedSession);
      }
      
      alert('Session rejected! All documents marked as rejected.');
      loadSessions();
    } catch (err) {
      alert('Failed to reject: ' + (err.response?.data?.error || err.message));
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'warning',
      in_progress: 'info',
      pending_review: 'primary',
      completed: 'success',
      rejected: 'error',
      cancelled: 'default',
    };
    return colors[status] || 'default';
  };

  // Investigator management functions
  const loadAgents = async () => {
    try {
      setAgentsLoading(true);
      const response = await api.get('/auth/agents');
      setAgents(response.data.agents);
      setAgentsLoading(false);
    } catch (err) {
      console.error('Failed to load agents:', err);
      setAgentsLoading(false);
    }
  };

  const validateAgentUsername = (username) => {
    if (!username || username.trim() === '') {
      return 'Username required hai';
    }
    const trimmedUsername = username.trim();
    
    // Username should be 3-30 characters, alphanumeric and underscore only
    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return 'Username 3 se 30 characters ke beech mein hona chahiye';
    }
    
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return 'Username mein sirf letters, numbers aur underscore allowed hai';
    }
    
    return '';
  };

  const validateAgentPassword = (password) => {
    if (!password || password.trim() === '') {
      return 'Password required hai';
    }
    if (password.length < 6) {
      return 'Password at least 6 characters hona chahiye';
    }
    return '';
  };

  const handleCreateAgent = async () => {
    const usernameError = validateAgentUsername(newAgent.username);
    const passwordError = validateAgentPassword(newAgent.password);
    
    setAgentErrors({
      username: usernameError,
      password: passwordError,
    });

    if (usernameError || passwordError) {
      return;
    }

    try {
      const response = await api.post('/auth/agents', {
        username: newAgent.username.trim(),
        password: newAgent.password,
        fullName: newAgent.fullName.trim() || null,
      });
      
      setAgentSuccess(`Investigator successfully created! Username: ${response.data.agent.username}`);
      setOpenAgentDialog(false);
      setNewAgent({ username: '', password: '', fullName: '' });
      setAgentErrors({ username: '', password: '' });
      loadAgents();
      
      // Clear success message after 5 seconds
      setTimeout(() => setAgentSuccess(''), 5000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to create investigator';
      setAgentErrors({
        username: errorMsg.includes('username') ? errorMsg : '',
        password: errorMsg.includes('password') ? errorMsg : '',
      });
    }
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4">Admin Dashboard</Typography>
          <Box>
            {activeTab === 0 && (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Add />}
                  onClick={() => setOpenDialog(true)}
                  sx={{ mr: 1 }}
                >
                  Create Session
                </Button>
                <Button
                  variant="contained"
                  startIcon={<TableChart />}
                  onClick={handleExportExcel}
                  sx={{ mr: 1 }}
                >
                  Export Excel
                </Button>
                <IconButton onClick={loadSessions} color="primary">
                  <Refresh />
                </IconButton>
              </>
            )}
            {activeTab === 1 && (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PersonAdd />}
                  onClick={() => setOpenAgentDialog(true)}
                  sx={{ mr: 1 }}
                >
                  Add Investigator
                </Button>
                <IconButton onClick={loadAgents} color="primary">
                  <Refresh />
                </IconButton>
              </>
            )}
            {activeTab === 2 && (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Upload />}
                  onClick={() => setShowUploadDialog(true)}
                  sx={{ mr: 1 }}
                >
                  Upload CSV/Excel
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<Refresh />}
                  onClick={() => {
                    console.log('🔄 [MANUAL REFRESH] Refresh button clicked');
                    loadBulkPendingSessions();
                  }}
                  sx={{ mr: 1 }}
                >
                  Refresh Data
                </Button>
                <IconButton 
                  onClick={() => {
                    console.log('🔄 [ICON REFRESH] Icon button clicked');
                    loadBulkPendingSessions();
                  }} 
                  color="primary"
                  title="Refresh Bulk Pending"
                >
                  <Refresh />
                </IconButton>
              </>
            )}
            <Button
              variant="outlined"
              startIcon={<Logout />}
              onClick={handleLogout}
              sx={{ ml: 1 }}
            >
              Logout
            </Button>
          </Box>
        </Box>

        {/* Tabs */}
        <Paper elevation={2} sx={{ mb: 2 }}>
          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
            <Tab icon={<TableChart />} label="Sessions" />
            <Tab icon={<People />} label="Investigators" />
            <Tab icon={<Upload />} label="Bulk Pending" />
          </Tabs>
        </Paper>

        {agentSuccess && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAgentSuccess('')}>
            {agentSuccess}
          </Alert>
        )}

        {/* Sessions Tab */}
        {activeTab === 0 && (
          <>

            {/* Filters */}
            <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  select
                  label="Status"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="in_progress">In Progress</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                </TextField>

                <TextField
                  type="date"
                  label="Start Date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  type="date"
                  label="End Date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            </Paper>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Session ID</TableCell>
                    <TableCell>User Name</TableCell>
                    <TableCell>User Phone</TableCell>
                    <TableCell>Investigator</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created At</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No sessions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>{session.session_id}</TableCell>
                        <TableCell>{session.user_name || 'N/A'}</TableCell>
                        <TableCell>{session.user_phone || 'N/A'}</TableCell>
                        <TableCell>{session.agent_name || session.agent_username || 'N/A'}</TableCell>
                        <TableCell>
                          <Chip
                            label={session.status}
                            color={getStatusColor(session.status)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(session.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleViewSession(session)}
                            sx={{ mr: 1 }}
                          >
                            View
                          </Button>
                          <IconButton
                            color="primary"
                            onClick={() => handleExportPDF(session.session_id)}
                            title="Export PDF"
                          >
                            <PictureAsPdf />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* Investigators Tab */}
        {activeTab === 1 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Username</TableCell>
                  <TableCell>Full Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      Loading investigators...
                    </TableCell>
                  </TableRow>
                ) : agents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No investigators found. Click "Add Investigator" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell>{agent.id}</TableCell>
                      <TableCell>{agent.username}</TableCell>
                      <TableCell>{agent.fullName || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip
                          label={agent.isActive ? 'Active' : 'Inactive'}
                          color={agent.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(agent.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Bulk Pending Tab */}
        {activeTab === 2 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Record ID</TableCell>
                  <TableCell>User Name</TableCell>
                  <TableCell>User Phone</TableCell>
                  <TableCell>Investigator</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bulkPendingSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No bulk pending sessions. Upload a CSV/Excel file to create sessions.
                    </TableCell>
                  </TableRow>
                ) : (
                  bulkPendingSessions.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>#{record.id}</TableCell>
                      <TableCell>{record.user_name || 'N/A'}</TableCell>
                      <TableCell>{record.user_phone || 'N/A'}</TableCell>
                      <TableCell>{record.agent_name || record.agent_username || record.investigator_name || 'N/A'}</TableCell>
                      <TableCell>
                        {new Date(record.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          size="small"
                          color="primary"
                          startIcon={<PlayArrow />}
                          onClick={() => handleStartSession(record)}
                        >
                          CREATE SESSION
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onClose={() => { setShowUploadDialog(false); setUploadFile(null); }} maxWidth="sm" fullWidth>
          <DialogTitle>Upload CSV/Excel File</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Upload a CSV or Excel file with exactly these columns:
            </Typography>
            <Typography variant="body2" component="div" sx={{ mb: 2, pl: 2 }}>
              <strong>Required:</strong><br />
              • <strong>user_name</strong> (or "user name")<br />
              • <strong>user_phone</strong> (or "user phone")<br />
              <strong>Optional:</strong><br />
              • <strong>investigator_name</strong> (or "investigator name")<br />
              <br />
              <em>Note: Any extra columns will be automatically ignored.</em>
            </Typography>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setUploadFile(e.target.files[0])}
              style={{ width: '100%', padding: '8px' }}
            />
            {uploadFile && (
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                Selected: {uploadFile.name}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setShowUploadDialog(false); setUploadFile(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkUpload} 
              variant="contained" 
              disabled={!uploadFile || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Upload Result Dialog */}
        <Dialog 
          open={showResultDialog} 
          onClose={() => setShowResultDialog(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Bulk Upload Result
          </DialogTitle>
          <DialogContent>
            {uploadResult && (
              <>
                <Alert 
                  severity={uploadResult.created > 0 ? "success" : "warning"} 
                  sx={{ mb: 2 }}
                >
                  {uploadResult.message || `✅ Successfully stored ${uploadResult.created} record(s) in Bulk Pending!`}
                  <br />
                  <strong>Next Step:</strong> Go to "BULK PENDING" tab and click "CREATE SESSION" button to create actual sessions.
                  {uploadResult.errors > 0 && (
                    <><br /><br />⚠️ {uploadResult.errors} error(s) occurred.
                    </>
                  )}
                </Alert>
                
                {uploadResult.errors > 0 && uploadResult.errorDetails && uploadResult.errorDetails.length > 0 && (
                  <Box>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Error Details:
                    </Typography>
                    <Box 
                      sx={{ 
                        maxHeight: '400px', 
                        overflowY: 'auto',
                        bgcolor: 'grey.100',
                        p: 2,
                        borderRadius: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.875rem'
                      }}
                    >
                      {uploadResult.errorDetails.map((error, index) => (
                        <Typography 
                          key={index} 
                          sx={{ 
                            mb: 1, 
                            color: 'error.main',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {error}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowResultDialog(false)} variant="contained">
              OK
            </Button>
          </DialogActions>
        </Dialog>

        {/* Create Session Dialog */}
        <Dialog 
          open={openDialog} 
          onClose={() => {
            setOpenDialog(false);
            setNewSession({ userName: '', userPhone: '', userEmail: '', agentId: '' });
          }} 
          maxWidth="sm" 
          fullWidth
        >
          <DialogTitle>Create New KYC Session</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="User Name *"
                value={newSession.userName}
                onChange={(e) => setNewSession({ ...newSession, userName: e.target.value })}
                fullWidth
                required
              />
              <TextField
                select
                label="Assign to Investigator (Optional)"
                value={newSession.agentId}
                onChange={(e) => setNewSession({ ...newSession, agentId: e.target.value })}
                fullWidth
                helperText="Select investigator to assign this session, or leave empty for unassigned"
                SelectProps={{
                  native: true,
                }}
              >
                <option value="">-- Unassigned --</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.fullName || agent.username} ({agent.username})
                  </option>
                ))}
              </TextField>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  select
                  label="Country Code"
                  value={countryCode}
                  onChange={(e) => {
                    const nextCode = e.target.value;
                    setCountryCode(nextCode);
                    const trimmed = sanitizePhoneInput(newSession.userPhone, nextCode);
                    if (trimmed !== newSession.userPhone) {
                      setNewSession({ ...newSession, userPhone: trimmed });
                    }
                    if (trimmed.trim() !== '') {
                      const error = validatePhone(trimmed, nextCode);
                      setValidationErrors({ ...validationErrors, userPhone: error });
                    }
                  }}
                  sx={{ minWidth: 140 }}
                  SelectProps={{
                    native: false,
                  }}
                >
                  {countryCodes.map((country) => (
                    <MenuItem key={country.code} value={country.code}>
                      {country.flag} {country.code} ({country.country})
                    </MenuItem>
                  ))}
                </TextField>
              <TextField
                label="User Phone *"
                value={newSession.userPhone}
                type="tel"
                inputProps={{
                  inputMode: 'numeric',
                  maxLength: countryCode === '+91' ? 10 : 15,
                  autoComplete: 'tel-national',
                }}
                onChange={(e) => {
                    const phoneValue = sanitizePhoneInput(e.target.value, countryCode);
                    setNewSession({ ...newSession, userPhone: phoneValue });
                    if (phoneValue.trim() !== '') {
                      const error = validatePhone(phoneValue, countryCode);
                      setValidationErrors({ ...validationErrors, userPhone: error });
                    } else {
                      setValidationErrors({ ...validationErrors, userPhone: '' });
                    }
                }}
                onBlur={(e) => {
                    const phoneValue = sanitizePhoneInput(e.target.value, countryCode);
                    if (phoneValue !== e.target.value) {
                      setNewSession({ ...newSession, userPhone: phoneValue });
                    }
                    const error = validatePhone(phoneValue, countryCode);
                    setValidationErrors({ ...validationErrors, userPhone: error });
                }}
                fullWidth
                required
                error={!!validationErrors.userPhone}
                  helperText={validationErrors.userPhone || (countryCode === '+91' ? '10-digit Indian mobile number enter karein (e.g., 9876543210)' : 'Mobile number enter karein')}
              />
              </Box>
              <TextField
                label="User Email"
                type="email"
                value={newSession.userEmail}
                onChange={(e) => {
                  const emailValue = e.target.value;
                  setNewSession({ ...newSession, userEmail: emailValue });
                  // Real-time validation - validate as user types
                  const error = validateEmail(emailValue);
                  setValidationErrors({ ...validationErrors, userEmail: error });
                }}
                onBlur={(e) => {
                  // Validate on blur to ensure final check
                  const error = validateEmail(e.target.value);
                  setValidationErrors({ ...validationErrors, userEmail: error });
                }}
                fullWidth
                error={!!validationErrors.userEmail}
                helperText={validationErrors.userEmail || 'Optional: Valid email address enter karein (e.g., user@example.com)'}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button 
              variant="contained" 
              onClick={handleCreateSession}
              disabled={
                !newSession.userName || 
                !newSession.userPhone || 
                !!validationErrors.userPhone || 
                !!validationErrors.userEmail
              }
            >
              Create Session
            </Button>
          </DialogActions>
        </Dialog>

        {/* Session created — centered success (replaces browser alert) */}
        <Dialog
          open={!!sessionCreatedSuccess}
          onClose={() => {
            setSessionCreatedSuccess(null);
            setLinkCopied(false);
          }}
          maxWidth="sm"
          fullWidth
          scroll="body"
          PaperProps={{
            sx: {
              borderRadius: 2,
              m: 2,
            },
          }}
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
            <CheckCircle color="success" />
            Session created
          </DialogTitle>
          <DialogContent dividers sx={{ pt: 2 }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              {(() => {
                const s = sessionCreatedSuccess;
                if (!s) return '';
                if (s.smsSent && s.emailSent) {
                  return 'KYC session was created successfully. The join link has been sent to the user via SMS and email.';
                }
                if (s.smsSent) {
                  return 'KYC session was created successfully. The join link has been sent to the user via SMS.';
                }
                if (s.emailSent) {
                  return 'KYC session was created successfully. The join link has been sent to the user by email.';
                }
                return 'KYC session was created successfully. Copy the join link below and share it with the user.';
              })()}
            </Alert>
            {sessionCreatedSuccess && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sessionCreatedSuccess.smsSent === true && sessionCreatedSuccess.smsWarning && (
                  <Alert severity="warning">{sessionCreatedSuccess.smsWarning}</Alert>
                )}
                {sessionCreatedSuccess.smsSent === false && sessionCreatedSuccess.smsError && (
                  <Alert severity="warning">{sessionCreatedSuccess.smsError}</Alert>
                )}
                {sessionCreatedSuccess.emailSent === false && sessionCreatedSuccess.emailError && (
                  <Alert severity="warning">{sessionCreatedSuccess.emailError}</Alert>
                )}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    User join link
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    value={sessionCreatedSuccess.joinLink}
                    InputProps={{ readOnly: true }}
                    size="small"
                    sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 13 } }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      startIcon={<ContentCopy />}
                      onClick={handleCopySessionJoinLink}
                    >
                      {linkCopied ? 'Copied!' : 'Copy link'}
                    </Button>
                    {linkCopied && (
                      <Typography variant="caption" color="success.main">
                        Copied to clipboard
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => {
                setSessionCreatedSuccess(null);
                setLinkCopied(false);
              }}
            >
              Done
            </Button>
          </DialogActions>
        </Dialog>

        {/* Session Details Dialog */}
        <Dialog open={openDetailsDialog} onClose={() => setOpenDetailsDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            Session Details - {selectedSession?.session_id}
          </DialogTitle>
          <DialogContent>
            {sessionDetails && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" gutterBottom>User Information</Typography>
                <Typography><strong>Name:</strong> {sessionDetails.user_name || 'N/A'}</Typography>
                <Typography><strong>Phone:</strong> {sessionDetails.user_phone || 'N/A'}</Typography>
                <Typography><strong>Email:</strong> {sessionDetails.user_email || 'N/A'}</Typography>
                <Typography><strong>Status:</strong> {sessionDetails.status}</Typography>
                
                {sessionDetails.notes && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: sessionDetails.status === 'rejected' ? 'error.light' : 'info.light', borderRadius: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      <strong>{sessionDetails.status === 'rejected' ? 'Reject Reason:' : 'Notes:'}</strong>
                    </Typography>
                    <Typography variant="body2">{sessionDetails.notes}</Typography>
                  </Box>
                )}
                
                <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Documents</Typography>
                {sessionDetails.documents && sessionDetails.documents.length > 0 ? (
                  <Box>
                    {sessionDetails.documents.map((doc, idx) => (
                      <Paper key={doc.id || idx} sx={{ p: 2, mb: 2 }}>
                        <Typography><strong>Type:</strong> {getDocumentTypeLabel(doc.document_type)}</Typography>
                        {doc.aadhaar_number && <Typography><strong>Aadhaar:</strong> {doc.aadhaar_number}</Typography>}
                        {doc.name && <Typography><strong>Name:</strong> {doc.name}</Typography>}
                        {doc.date_of_birth && <Typography><strong>DOB:</strong> {doc.date_of_birth}</Typography>}
                        <Typography><strong>Status:</strong> {doc.verification_status || 'pending'}</Typography>
                        {doc.remark && (
                          <Typography sx={{ mt: 1 }}><strong>Remark:</strong> {doc.remark}</Typography>
                        )}
                        {doc.image_url && (
                          <Box sx={{ mt: 1 }}>
                            <img
                              src={doc.image_url}
                              alt="Document"
                              style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }}
                            />
                          </Box>
                        )}
                      </Paper>
                    ))}
                  </Box>
                ) : (
                  <Typography color="text.secondary">No documents uploaded yet</Typography>
                )}

                <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Video Recordings</Typography>
                {sessionDetails.recordings && sessionDetails.recordings.length > 0 ? (
                  <Box>
                    {sessionDetails.recordings.map((rec, idx) => (
                      <Paper key={idx} sx={{ p: 2, mb: 2 }}>
                        <Typography><strong>Recording {idx + 1}</strong></Typography>
                        {rec.file_size_bytes && (
                          <Typography><strong>File Size:</strong> {(rec.file_size_bytes / 1024 / 1024).toFixed(2)} MB</Typography>
                        )}
                        {rec.recording_started_at && (
                          <Typography><strong>Recorded At:</strong> {new Date(rec.recording_started_at).toLocaleString()}</Typography>
                        )}
                        {(rec.video_url || rec.s3_key) && (
                          <Box sx={{ mt: 1 }}>
                            <Button 
                              variant="outlined" 
                              size="small"
                              href={rec.video_url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View Video Recording
                            </Button>
                          </Box>
                        )}
                      </Paper>
                    ))}
                  </Box>
                ) : (
                  <Typography color="text.secondary">No video recordings available</Typography>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDetailsDialog(false)}>Close</Button>
            {sessionDetails && sessionDetails.status !== 'completed' && sessionDetails.status !== 'rejected' && (
              <>
                <Button variant="contained" color="error" onClick={handleReject}>
                  Reject
                </Button>
                <Button variant="contained" color="success" onClick={handleApprove}>
                  Approve
                </Button>
              </>
            )}
            {sessionDetails && (sessionDetails.status === 'completed' || sessionDetails.status === 'rejected') && (
              <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
                Status: {sessionDetails.status === 'completed' ? 'Approved' : 'Rejected'}
              </Typography>
            )}
          </DialogActions>
        </Dialog>

        {/* Reject Reason Dialog */}
        <Dialog open={openRejectDialog} onClose={() => { setOpenRejectDialog(false); setRejectReason(''); }} maxWidth="sm" fullWidth>
          <DialogTitle>Reject Session</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Please provide a reason for rejecting this session:
            </Typography>
            <TextField
              autoFocus
              margin="dense"
              label="Reject Reason"
              fullWidth
              multiline
              rows={4}
              variant="outlined"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setOpenRejectDialog(false); setRejectReason(''); }}>Cancel</Button>
            <Button 
              variant="contained" 
              color="error" 
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim()}
            >
              Confirm Reject
            </Button>
          </DialogActions>
        </Dialog>

        {/* Add Investigator Dialog */}
        <Dialog open={openAgentDialog} onClose={() => {
          setOpenAgentDialog(false);
          setNewAgent({ username: '', password: '', fullName: '' });
          setAgentErrors({ username: '', password: '' });
        }} maxWidth="sm" fullWidth>
          <DialogTitle>Add New Investigator</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Username *"
                value={newAgent.username}
                onChange={(e) => {
                  const usernameValue = e.target.value;
                  setNewAgent({ ...newAgent, username: usernameValue });
                  const error = validateAgentUsername(usernameValue);
                  setAgentErrors({ ...agentErrors, username: error });
                }}
                onBlur={(e) => {
                  const error = validateAgentUsername(e.target.value);
                  setAgentErrors({ ...agentErrors, username: error });
                }}
                fullWidth
                required
                error={!!agentErrors.username}
                helperText={agentErrors.username || 'Username 3-30 characters, letters, numbers aur underscore only'}
              />
              <TextField
                label="Password *"
                type="password"
                value={newAgent.password}
                onChange={(e) => {
                  const passwordValue = e.target.value;
                  setNewAgent({ ...newAgent, password: passwordValue });
                  const error = validateAgentPassword(passwordValue);
                  setAgentErrors({ ...agentErrors, password: error });
                }}
                onBlur={(e) => {
                  const error = validateAgentPassword(e.target.value);
                  setAgentErrors({ ...agentErrors, password: error });
                }}
                fullWidth
                required
                error={!!agentErrors.password}
                helperText={agentErrors.password || 'Password at least 6 characters hona chahiye'}
              />
              <TextField
                label="Full Name (Optional)"
                value={newAgent.fullName}
                onChange={(e) => setNewAgent({ ...newAgent, fullName: e.target.value })}
                fullWidth
                helperText="Investigator ka full name (optional)"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setOpenAgentDialog(false);
              setNewAgent({ username: '', password: '', fullName: '' });
              setAgentErrors({ username: '', password: '' });
            }}>
              Cancel
            </Button>
            <Button 
              variant="contained" 
              onClick={handleCreateAgent}
              disabled={
                !newAgent.username || 
                !newAgent.password || 
                !!agentErrors.username || 
                !!agentErrors.password
              }
            >
              Create Investigator
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default AdminPanel;

