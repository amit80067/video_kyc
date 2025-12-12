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
} from '@mui/material';
import {
  Download,
  Logout,
  Refresh,
  PictureAsPdf,
  TableChart,
  Add,
} from '@mui/icons-material';
import api from '../services/api';

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
  });
  const [validationErrors, setValidationErrors] = useState({
    userPhone: '',
    userEmail: '',
  });
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
      navigate('/agent/login');
      return;
    }
    
    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'admin') {
        // Not an admin, redirect to agent dashboard or login
        navigate('/agent/dashboard');
        return;
      }
    } catch (err) {
      console.error('Error parsing user data:', err);
      navigate('/agent/login');
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
          loadSessions();
        }
      } catch (err) {
        console.error('Error parsing user data:', err);
      }
    }
  }, [filters]);

  const loadSessions = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.get(`/sessions?${params.toString()}`);
      setSessions(response.data.sessions);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setLoading(false);
    }
  };

  const handleExportPDF = async (sessionId) => {
    try {
      const response = await api.get(`/export/pdf/${sessionId}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kyc-report-${sessionId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export PDF:', err);
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
    navigate('/agent/login');
  };

  // Validate mobile number (Indian format: 10 digits, can start with +91 or 0)
  const validatePhone = (phone) => {
    if (!phone || phone.trim() === '') {
      return 'Mobile number required hai';
    }
    // Remove spaces and special characters for validation
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    // Check if it starts with +91
    if (cleanPhone.startsWith('+91')) {
      const digits = cleanPhone.substring(3);
      if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
        return '';
      }
      return 'Invalid mobile number. 10-digit Indian mobile number enter karein (6-9 se start hona chahiye)';
    }
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
  };

  // Validate email
  const validateEmail = (email) => {
    if (!email || email.trim() === '') {
      return ''; // Email is optional
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Invalid email address. Valid email enter karein (e.g., user@example.com)';
    }
    return '';
  };

  const handleCreateSession = async () => {
    // Validate phone number
    const phoneError = validatePhone(newSession.userPhone);
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
      const response = await api.post('/sessions', newSession);
      alert(`Session created! Link: ${response.data.session.join_link}`);
      setOpenDialog(false);
      setNewSession({ userName: '', userPhone: '', userEmail: '' });
      setValidationErrors({ userPhone: '', userEmail: '' });
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err.response?.data?.error || err.message));
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
      alert('Session approved!');
      setOpenDetailsDialog(false);
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
      alert('Session rejected!');
      setOpenRejectDialog(false);
      setRejectReason('');
      setOpenDetailsDialog(false);
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

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4">Admin Dashboard</Typography>
          <Box>
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
                <TableCell>Agent</TableCell>
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
                      {session.recording_count > 0 ? (
                        <IconButton
                          color="primary"
                          onClick={() => handleExportPDF(session.session_id)}
                          title="Export PDF"
                        >
                          <PictureAsPdf />
                        </IconButton>
                      ) : (
                        <IconButton
                          disabled
                          title="PDF available after video recording upload"
                        >
                          <PictureAsPdf style={{ opacity: 0.3 }} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Create Session Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
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
                label="User Phone *"
                value={newSession.userPhone}
                onChange={(e) => {
                  setNewSession({ ...newSession, userPhone: e.target.value });
                  // Clear error when user starts typing
                  if (validationErrors.userPhone) {
                    setValidationErrors({ ...validationErrors, userPhone: '' });
                  }
                }}
                onBlur={(e) => {
                  // Validate on blur
                  const error = validatePhone(e.target.value);
                  setValidationErrors({ ...validationErrors, userPhone: error });
                }}
                fullWidth
                required
                error={!!validationErrors.userPhone}
                helperText={validationErrors.userPhone || 'Enter 10-digit Indian mobile number (e.g., 9876543210)'}
              />
              <TextField
                label="User Email"
                type="email"
                value={newSession.userEmail}
                onChange={(e) => {
                  setNewSession({ ...newSession, userEmail: e.target.value });
                  // Clear error when user starts typing
                  if (validationErrors.userEmail) {
                    setValidationErrors({ ...validationErrors, userEmail: '' });
                  }
                }}
                onBlur={(e) => {
                  // Validate on blur
                  const error = validateEmail(e.target.value);
                  setValidationErrors({ ...validationErrors, userEmail: error });
                }}
                fullWidth
                error={!!validationErrors.userEmail}
                helperText={validationErrors.userEmail || 'Optional: Enter a valid email address'}
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
                      <Paper key={idx} sx={{ p: 2, mb: 2 }}>
                        <Typography><strong>Type:</strong> {doc.document_type}</Typography>
                        {doc.aadhaar_number && <Typography><strong>Aadhaar:</strong> {doc.aadhaar_number}</Typography>}
                        {doc.name && <Typography><strong>Name:</strong> {doc.name}</Typography>}
                        {doc.date_of_birth && <Typography><strong>DOB:</strong> {doc.date_of_birth}</Typography>}
                        <Typography><strong>Status:</strong> {doc.verification_status || 'pending'}</Typography>
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
      </Box>
    </Container>
  );
};

export default AdminPanel;

