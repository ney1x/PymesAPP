import client from './client';

export const authApi = {
  login: (data) => client.post('/auth/login', data),
  register: (data) => client.post('/auth/register', data),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
  updateMe: (data) => client.put('/auth/me', data),
  forgotPassword: (data) => client.post('/auth/forgot-password', data),
  resetPassword: (data) => client.post('/auth/reset-password', data),
  verifyEmail: (data) => client.post('/auth/verify-email', data),
};

export const pymesApi = {
  list: (params) => client.get('/pymes', { params }),
  create: (data) => client.post('/pymes', data),
  update: (id, data) => client.put(`/pymes/${id}`, data),
  remove: (id) => client.delete(`/pymes/${id}`),
  leave: (id) => client.delete(`/pymes/${id}/membresia`),
  miembros: {
    list: (pymeId) => client.get(`/pymes/${pymeId}/miembros`),
    invite: (pymeId, data) => client.post(`/pymes/${pymeId}/miembros`, data),
    update: (pymeId, miembroId, data) => client.patch(`/pymes/${pymeId}/miembros/${miembroId}`, data),
    remove: (pymeId, miembroId) => client.delete(`/pymes/${pymeId}/miembros/${miembroId}`),
  },
  sedes: {
    list: (pymeId) => client.get(`/pymes/${pymeId}/sedes`),
    create: (pymeId, data) => client.post(`/pymes/${pymeId}/sedes`, data),
    update: (pymeId, sedeId, data) => client.put(`/pymes/${pymeId}/sedes/${sedeId}`, data),
    remove: (pymeId, sedeId) => client.delete(`/pymes/${pymeId}/sedes/${sedeId}`),
  },
  mensajes: {
    listEnviados: (pymeId) => client.get(`/pymes/${pymeId}/mensajes`),
    enviar: (pymeId, data) => client.post(`/pymes/${pymeId}/mensajes`, data),
  },
};

export const invitacionesApi = {
  list: () => client.get('/invitaciones'),
  aceptar: (id) => client.post(`/invitaciones/${id}/aceptar`),
  rechazar: (id) => client.post(`/invitaciones/${id}/rechazar`),
};

export const mensajesApi = {
  list: (params) => client.get('/mensajes', { params }),
  marcarLeido: (id) => client.post(`/mensajes/${id}/leido`),
};

export const notificacionesApi = {
  resumen: () => client.get('/notificaciones'),
  decisiones: () => client.get('/notificaciones/decisiones'),
  descartarDecision: (id) => client.post(`/notificaciones/decisiones/${id}/visto`),
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

export const facturasApi = {
  list: (params) => client.get('/facturas', { params }),
  create: (data) => client.post('/facturas', data),
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
  enviar: (mensaje, config) => client.post('/chat', { mensaje }, config),
  limpiarHistorial: () => client.delete('/chat/historial'),
};
