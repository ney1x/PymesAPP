const pymesService = require('../services/pymes.service');
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

// --- Miembros (equipo) - solo OWNER administra ---

const miembroValidations = validate([
  body('email').isEmail().withMessage('Correo inválido'),
  body('rol').isIn(['OWNER', 'VENDEDOR', 'INVENTARIO', 'ANALISTA']).withMessage('Rol inválido'),
  body('sedeId').optional({ nullable: true }).isInt().withMessage('sedeId inválido'),
]);

const updateMiembroValidations = validate([
  body('rol').optional().isIn(['OWNER', 'VENDEDOR', 'INVENTARIO', 'ANALISTA']).withMessage('Rol inválido'),
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
    const { membresia, claveTemporal } = await pymesService.inviteMiembro(req.params.id, req.user, req.body);
    res.status(201).json({ ok: true, membresia, claveTemporal });
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

module.exports = router;
