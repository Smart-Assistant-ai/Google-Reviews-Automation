import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/')) {
      localStorage.removeItem('rp_token');
      window.location.href = '/login';
    }
    return Promise.reject(new Error(err.response?.data?.error || err.message));
  },
);

export default api;
