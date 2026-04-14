import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request interceptor: attach auth tokens
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: redirect to login on 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
