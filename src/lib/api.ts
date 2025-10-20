import axios, { AxiosError } from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  // IMPORTANT: si votre /auth/refresh lit un cookie httpOnly, laissez avec credentials.
  withCredentials: true,
});

// Ajout du Bearer si présent (localStorage côté navigateur)
api.interceptors.request.use((cfg) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      cfg.headers = cfg.headers || {};
      (cfg.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  return cfg;
});

let isRefreshing = false;
let queue: Array<() => void> = [];

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config!;
    if (status !== 401) throw error;

    // Evite boucles infinies
    // @ts-ignore
    if (original.__isRetry) throw error;
    // @ts-ignore
    original.__isRetry = true;

    // Refresh unique + mise en file des requêtes en attente
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true } // cookie httpOnly attendu ici
        );
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', data.access_token);
        }
        queue.forEach((fn) => fn());
        queue = [];
      } catch (e) {
        queue = [];
        throw e;
      } finally {
        isRefreshing = false;
      }
    }

    await new Promise<void>((resolve) => queue.push(resolve));

    const newToken =
      typeof window !== 'undefined'
        ? localStorage.getItem('access_token')
        : null;

    if (newToken) {
      original.headers = original.headers || {};
      (original.headers as any).Authorization = `Bearer ${newToken}`;
    }
    return api.request(original);
  }
);

export default api;
