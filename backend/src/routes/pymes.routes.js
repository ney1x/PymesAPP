const pymesService = require('../services/pymes.service');
const mensajesService = require('../services/mensajes.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { authenticate, requirePymeRole } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const pymeValidations = validate([
  body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
  body('tipo').optional().isIn([
    'MINIMARKET', 'TIENDA', 'FERRETERIA', 'FARMACIA', 'PAPELERIA',
    'RESTAURANTE', 'CAFETERIA', 'PANADERIA', 'LICORERA', 'VETERINARIA', 'OTRO',
  ]).withMessage('Tipo de PYME inválido'),
  body('sector').optional().isString(),
  body('ciudad').optional().isString(),
  body('direccion').optional().isString(),
  body('telefono').optional().isString(),
  body('descripcion').optional().isString(),
]);

const idParam = validate([param('id').isInt().withMessage('ID inválido')]);

router.get(
  '/',
  validate([query('search').optional().isString()]),
  asyncHandler(async (req, res) => {
    const pymes = await pymesService.list(req.user, req.query);
    res.json({ ok: true, pymes });
  })
);

router.post('/', pymeValidations, asyncHandler(async (req, res) => {
  const pyme = await pymesService.create(req.user, req.body);
  res.status(201).json({ ok: true, pyme });
}));

router.get('/:id', idParam, asyncHandler(async (req, res) => {
  const pyme = await pymesService.getById(req.params.id, req.user);
  res.json({ ok: true, pyme });
}));

router.put('/:id', idParam, pymeValidations, asyncHandler(async (req, res) => {
  const pyme = await pymesService.update(req.params.id, req.user, req.body);
  res.json({ ok: true, pyme });
}));

router.delete('/:id', idParam, asyncHandler(async (req, res) => {
  await pymesService.remove(req.params.id, req.user);
  res.json({ ok: true, message: 'PYME eliminada' });
}));

// Autoservicio: cualquier miembro invitado (no el OWNER) abandona la PYME
// por su cuenta — sin requirePymeRole('OWNER'), la exigencia de rol vive
// dentro de pymesService.leaveMembresia contra la propia membresía.
router.delete('/:id/membresia', idParam, asyncHandler(async (req, res) => {
  await pymesService.leaveMembresia(req.params.id, req.user);
  res.json({ ok: true, message: 'Saliste de la PYME' });
}));

// --- Miembros (equipo) - solo OWNER administra ---

const miembroValidations = validate([
  body('email').isEmail().withMessage('Correo inválido'),
  body('roles').isArray({ min: 1 }).withMessage('Selecciona al menos un rol'),
  body('roles.*').isIn(['VENDEDOR', 'INVENTARIO', 'ANALISTA']).withMessage('Rol inválido'),
  body('sedeId').optional({ nullable: true }).isInt().withMessage('sedeId inválido'),
]);

const updateMiembroValidations = validate([
  body('roles').optional().isArray({ min: 1 }).withMessage('Selecciona al menos un rol'),
  body('roles.*').optional().isIn(['VENDEDOR', 'INVENTARIO', 'ANALISTA']).withMessage('Rol inválido'),
  body('sedeId').optional({ nullable: true }).isInt().withMessage('sedeId inválido'),
]);

router.get(
  '/:id/miembros',
  idParam,
  requirePymeRole('OWNER'),
  asyncHandler(async (req, res) => {
    const miembros = await pymesService.listMiembros(req.params.id);
    res.json({ ok: true, miembros });
  })
);

router.post(
  '/:id/miembros',
  idParam,
  requirePymeRole('OWNER'),
  miembroValidations,
  asyncHandler(async (req, res) => {
    const { membresia } = await pymesService.inviteMiembro(req.params.id, req.user, req.body);
    res.status(201).json({ ok: true, membresia });
  })
);

router.patch(
  '/:id/miembros/:miembroId',
  idParam,
  validate([param('miembroId').isInt().withMessage('ID inválido')]),
  requirePymeRole('OWNER'),
  updateMiembroValidations,
  asyncHandler(async (req, res) => {
    const membresia = await pymesService.updateMiembro(req.params.id, req.params.miembroId, req.body);
    res.json({ ok: true, membresia });
  })
);

router.delete(
  '/:id/miembros/:miembroId',
  idParam,
  validate([param('miembroId').isInt().withMessage('ID inválido')]),
  requirePymeRole('OWNER'),
  asyncHandler(async (req, res) => {
    await pymesService.removeMiembro(req.params.id, req.params.miembroId);
    res.json({ ok: true, message: 'Miembro eliminado' });
  })
);

// --- Sedes - cualquier miembro activo puede ver, solo OWNER administra ---

const sedeValidations = validate([
  body('nombre').notEmpty().withMessage('El nombre de la sede es obligatorio'),
  body('direccion').optional().isString(),
  body('ciudad').optional().isString(),
]);

router.get(
  '/:id/sedes',
  idParam,
  requirePymeRole('OWNER', 'VENDEDOR', 'INVENTARIO', 'ANALISTA'),
  asyncHandler(async (req, res) => {
    const sedes = await pymesService.listSedes(req.params.id);
    res.json({ ok: true, sedes });
  })
);

router.post(
  '/:id/sedes',
  idParam,
  requirePymeRole('OWNER'),
  sedeValidations,
  asyncHandler(async (req, res) => {
    const sede = await pymesService.createSede(req.params.id, req.body);
    res.status(201).json({ ok: true, sede });
  })
);

router.put(
  '/:id/sedes/:sedeId',
  idParam,
  validate([param('sedeId').isInt().withMessage('ID inválido')]),
  requirePymeRole('OWNER'),
  sedeValidations,
  asyncHandler(async (req, res) => {
    const sede = await pymesService.updateSede(req.params.id, req.params.sedeId, req.body);
    res.json({ ok: true, sede });
  })
);

router.delete(
  '/:id/sedes/:sedeId',
  idParam,
  validate([param('sedeId').isInt().withMessage('ID inválido')]),
  requirePymeRole('OWNER'),
  asyncHandler(async (req, res) => {
    await pymesService.removeSede(req.params.id, req.params.sedeId);
    res.json({ ok: true, message: 'Sede eliminada' });
  })
);

// --- Mensajes del equipo - solo OWNER envía y ve el historial enviado ---

const mensajeValidations = validate([
  body('contenido').notEmpty().withMessage('El mensaje no puede estar vacío'),
  body('destinatarioId').optional({ nullable: true }).isInt().withMessage('destinatarioId inválido'),
  body('rol').optional({ nullable: true }).isIn(['VENDEDOR', 'INVENTARIO', 'ANALISTA']).withMessage('Rol inválido'),
  body('prioridad').optional({ nullable: true }).isIn(['BAJA', 'NORMAL', 'ALTA']).withMessage('Prioridad inválida'),
]);

router.get(
  '/:id/mensajes',
  idParam,
  requirePymeRole('OWNER'),
  asyncHandler(async (req, res) => {
    const mensajes = await mensajesService.enviados(req.params.id, req.user.id);
    res.json({ ok: true, mensajes });
  })
);

router.post(
  '/:id/mensajes',
  idParam,
  requirePymeRole('OWNER'),
  mensajeValidations,
  asyncHandler(async (req, res) => {
    const mensajes = await mensajesService.enviar(req.params.id, req.user, req.body);
    res.status(201).json({ ok: true, mensajes });
  })
);

module.exports = router;
