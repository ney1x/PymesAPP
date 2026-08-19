import axios from 'axios';

// El token de sesion vive en una cookie httpOnly (la pone el backend en
// /auth/login, /auth/register) — nunca en localStorage ni accesible desde
// JS, asi un XSS no puede robarlo. withCredentials manda esa cookie en
// cada request automaticamente, no hace falta adjuntar Authorization a mano.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const message = error.response?.data?.message || 'Error de conexión con el servidor';
    return Promise.reject(new Error(message));
  }
);

export default client;
