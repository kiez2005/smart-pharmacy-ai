import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Request Interceptor: Tự động đính kèm JWT Bearer Token nếu có
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('pharmacore_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Bắt lỗi 401 Unauthorized để xử lý hết hạn phiên
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pharmacore_token');
      localStorage.removeItem('pharmacore_user');
      window.dispatchEvent(new Event('pharmacore_unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default apiClient;
