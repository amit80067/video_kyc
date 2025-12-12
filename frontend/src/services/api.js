import axios from 'axios';

// Use relative URL for production (nginx will proxy to backend)
// Or use environment variable if set
const API_URL = process.env.REACT_APP_API_URL || '';

// Ensure API_URL is properly configured
let baseURL = '/api';
if (API_URL) {
  // If API_URL already ends with /api, use it as is
  // Otherwise, if it's a full URL, append /api
  if (API_URL.endsWith('/api')) {
    baseURL = API_URL;
  } else if (API_URL.startsWith('http')) {
    baseURL = `${API_URL}/api`;
  } else {
    baseURL = API_URL;
  }
}

const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/agent/login';
    }
    return Promise.reject(error);
  }
);

export default api;

