import client from './client';

export const authApi = {
  login: (data) => client.post('/auth/login', data),
  register: (data) => client.post('/auth/register', data),
  me: () => client.get('/auth/me'),
};

export const pymesApi = {
  list: (params) => client.get('/pymes', { params }),
  create: (data) => client.post('/pymes', data),
  update: (id, data) => client.put(`/pymes/${id}`, data),
  remove: (id) => client.delete(`/pymes/${id}`),
};

export const productosApi = {
  list: (params) => client.get('/productos', { params }),
  create: (data) => client.post('/productos', data),
  importar: (data) => client.post('/productos/importar', data),
  update: (id, data) => client.put(`/productos/${id}`, data),
  remove: (id) => client.delete(`/productos/${id}`),
};

export const inventarioApi = {
  list: (params) => client.get('/inventario', { params }),
  update: (id, data) => client.put(`/inventario/${id}`, data),
};

export const ventasApi = {
  list: (params) => client.get('/ventas', { params }),
  create: (data) => client.post('/ventas', data),
};

export const prediccionesApi = {
  list: (params) => client.get('/predicciones', { params }),
  generarTodo: (params) => client.post('/predicciones/generar', null, { params }),
  generarProducto: (productoId) => client.post(`/predicciones/generar/${productoId}`),
};

export const dashboardApi = {
  get: (params) => client.get('/dashboard', { params }),
};

export const reordenApi = {
  list: (params) => client.get('/reorden', { params }),
};

export const chatApi = {
  enviar: (mensaje) => client.post('/chat', { mensaje }),
  limpiarHistorial: () => client.delete('/chat/historial'),
};
