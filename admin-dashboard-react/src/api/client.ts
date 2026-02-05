import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// API base URL - defaults to production
const API_URL = import.meta.env.VITE_API_URL || 'https://renewed-appreciation-production-55e2.up.railway.app/api/v1';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - just logout, React will handle redirect
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// Export API URL for other uses (like OAuth)
export const getApiUrl = () => API_URL;
