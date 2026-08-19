import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Modal, Button, ErrorBox } from './ui';
import { productosApi } from '../api';

const COLUMNAS = ['nombre', 'codigo', 'categoria', 'precioVenta', 'costo', 'stockActual', 'stockMinimo', 'ventas'];

// Variantes de encabezado aceptadas por columna interna (normalizadas: sin
// tildes, minusculas, sin espacios/guiones). Permite que un archivo real de
// PYME con encabezados en espanol natural ("Precio de venta", "Stock") se
// mapee igual que la plantilla exacta, en vez de fallar en silencio.
const ALIAS_COLUMNAS = {
  nombre: ['nombre', 'producto', 'nombreproducto'],
  codigo: ['codigo', 'sku', 'referencia'],
  categoria: ['categoria', 'rubro'],
  precioVenta: ['precioventa', 'precio', 'preciodeventa', 'pventa'],
  costo: ['costo', 'costounitario', 'costocompra', 'preciocosto'],
  stockActual: ['stockactual', 'stock', 'existencias', 'cantidad'],
  stockMinimo: ['stockminimo', 'minimo', 'stockmin'],
  ventas: ['ventas', 'unidadesvendidas', 'cantidadvendida'],
};

const COLUMNAS_REQUERIDAS = ['nombre', 'precioVenta', 'costo'];

function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Mapea cada columna del archivo (por posicion) a su clave interna segun
// ALIAS_COLUMNAS. Devuelve tanto el mapa (indice -> clave) como el set de
// claves que si se reconocieron, para poder validar antes de parsear filas.
function mapearEncabezados(encabezadosCrudos) {
  const mapa = {};
  const encontradas = new Set();
  encabezadosCrudos.forEach((raw, idx) => {
    const norm = normalizarEncabezado(raw);
    if (!norm) return;
    const clave = Object.keys(ALIAS_COLUMNAS).find((c) => ALIAS_COLUMNAS[c].includes(norm));
    if (clave) {
      mapa[idx] = clave;
      encontradas.add(clave);
    }
  });
  return { mapa, encontradas };
}

// Plantilla como .xlsx real (no .csv): un CSV separado por comas se abre mal
// en Excel con configuracion regional en espanol (usa ";" como separador de
// lista) y todo el contenido termina en una sola celda. El formato .xlsx no
// tiene esa ambiguedad: cada valor queda en su propia celda sin importar la
// configuracion regional de quien lo abra.
function descargarPlantilla() {
  const datos = [COLUMNAS, ['Arroz 1kg', 'ARZ-001', 'Granos', 4500, 3200, 50, 10, 0]];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
  XLSX.writeFile(libro, 'plantilla-productos.xlsx');
}

function filaTieneProblema(fila) {
  const problemas = [];
  if (!String(fila.nombre || '').trim()) problemas.push('falta nombre');
  if (fila.precioVenta === '' || Number.isNaN(Number(fila.precioVenta))) problemas.push('precioVenta inválido');
  if (fila.costo === '' || Number.isNaN(Number(fila.costo))) problemas.push('costo inválido');
  return problemas;
}

export default function ImportarProductosModal({ open, onClose, pymes, onImported }) {
  const [modo, setModo] = useState('importar'); // 'importar' | 'exportar'
  const [pymeId, setPymeId] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [reporte, setReporte] = useState(null);
  const [formatoExport, setFormatoExport] = useState('xlsx'); // 'xlsx' | 'csv'
  const [exportando, setExportando] = useState(false);

  const reset = () => {
    setFileName('');
    setRows([]);
    setParseError(null);
    setReporte(null);
  };

  const handleClose = () => {
    reset();
    setPymeId('');
    setModo('importar');
    onClose();
  };

  const cambiarModo = (nuevoModo) => {
    setModo(nuevoModo);
    setParseError(null);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReporte(null);
    setParseError(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!filas.length) {
        setParseError('El archivo está vacío.');
        setRows([]);
        return;
      }

      const [encabezados, ...filasDatos] = filas;
      const { mapa, encontradas } = mapearEncabezados(encabezados);
      const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !encontradas.has(c));
      if (faltantes.length) {
        setParseError(
          `No reconocimos la(s) columna(s) ${faltantes.join(', ')} en la primera fila del archivo. `
          + `Encabezados esperados: ${COLUMNAS.join(', ')}. Descarga la plantilla para ver el formato exacto.`
        );
        setRows([]);
        return;
      }

      const parsed = filasDatos
        .filter((fila) => fila.some((celda) => String(celda ?? '').trim() !== ''))
        .map((fila) => {
          const obj = {};
          Object.entries(mapa).forEach(([idx, clave]) => {
            obj[clave] = fila[Number(idx)] ?? '';
          });
          return obj;
        });

      if (!parsed.length) {
        setParseError('El archivo no tiene filas de datos.');
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch (err) {
      setParseError('No se pudo leer el archivo. Verifica que sea .xlsx o .csv con las columnas de la plantilla.');
      setRows([]);
    }
  };

  const handleConfirm = async () => {
    if (!pymeId) {
      setParseError('Selecciona la PYME de destino.');
      return;
    }
    setImporting(true);
    setParseError(null);
    try {
      const resultado = await productosApi.importar({ pymeId: Number(pymeId), productos: rows });
      setReporte(resultado);
      if (resultado.errores.length === 0) {
        onImported(resultado);
      }
    } catch (err) {
      setParseError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    if (!pymeId) {
      setParseError('Selecciona la PYME de origen.');
      return;
    }
    setExportando(true);
    setParseError(null);
    try {
      const res = await productosApi.list({ pymeId: Number(pymeId) });
      const productos = res.productos || [];
      if (!productos.length) {
        setParseError('Esa PYME no tiene productos para exportar.');
        return;
      }

      const filas = productos.map((p) => [
        p.nombre,
        p.codigo,
        p.categoria || '',
        p.precioVenta,
        p.costo,
        p.inventario?.stockActual ?? 0,
        p.inventario?.stockMinimo ?? 0,
        p._count?.ventas ?? 0,
      ]);
      const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS, ...filas]);
      const pymeNombre = (pymes.find((p) => String(p.id) === pymeId)?.nombre || 'productos')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-');

      if (formatoExport === 'csv') {
        // Separador ";" (no ","): en Excel con configuracion regional en
        // espanol "," no es el separador de lista y todo cae en una sola
        // celda al abrirlo — mismo problema que ya se corrigio en la
        // plantilla de importacion. BOM UTF-8 al inicio para que Excel
        // muestre bien tildes/enies.
        const csv = XLSX.utils.sheet_to_csv(hoja, { FS: ';' });
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `productos-${pymeNombre}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
        XLSX.writeFile(libro, `productos-${pymeNombre}.xlsx`);
      }
    } catch (err) {
      setParseError(err.message || 'No se pudo exportar los productos.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <Modal open={open} title={modo === 'importar' ? 'Importar productos por Excel/CSV' : 'Exportar productos a Excel/CSV'} onClose={handleClose}>
      <div className="form-row" style={{ marginBottom: 16 }}>
        <Button type="button" variant={modo === 'importar' ? 'primary' : 'outline'} onClick={() => cambiarModo('importar')}>
          Importar
        </Button>
        <Button type="button" variant={modo === 'exportar' ? 'primary' : 'outline'} onClick={() => cambiarModo('exportar')}>
          Exportar
        </Button>
      </div>

      <ErrorBox error={parseError} />

      <div className="form-group">
        <label>{modo === 'importar' ? 'PYME de destino' : 'PYME de origen'}</label>
        <select value={pymeId} onChange={(e) => setPymeId(e.target.value)} required>
          <option value="">Selecciona una PYME</option>
          {pymes.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {modo === 'exportar' ? (
        <>
          <div className="form-group">
            <label>Formato</label>
            <select value={formatoExport} onChange={(e) => setFormatoExport(e.target.value)}>
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </div>

          <div className="form-row">
            <Button type="button" variant="ghost" onClick={handleClose}>Cerrar</Button>
            <Button type="button" loading={exportando} disabled={!pymeId} onClick={handleExport}>
              Descargar productos
            </Button>
          </div>
        </>
      ) : (
        <>
      <div className="form-group">
        <Button type="button" variant="ghost" onClick={descargarPlantilla}>
          Descargar plantilla (.xlsx)
        </Button>
      </div>

      <div className="form-group">
        <label>Archivo (.xlsx o .csv)</label>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
        {fileName && <p className="muted">Archivo: {fileName} · {rows.length} fila(s) leídas</p>}
      </div>

      {rows.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto', marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                {COLUMNAS.map((c) => <th key={c}>{c}</th>)}
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fila, i) => {
                const problemas = filaTieneProblema(fila);
                const errorServidor = reporte?.errores?.find((e) => e.fila === i + 2);
                return (
                  <tr key={i}>
                    <td>{i + 2}</td>
                    {COLUMNAS.map((c) => <td key={c}>{String(fila[c] ?? '')}</td>)}
                    <td>
                      {errorServidor ? (
                        <span style={{ color: 'var(--danger, #c0392b)' }}>{errorServidor.motivo}</span>
                      ) : problemas.length ? (
                        <span style={{ color: 'var(--danger, #c0392b)' }}>{problemas.join(', ')}</span>
                      ) : reporte ? (
                        <span style={{ color: 'var(--success, #2e7d32)' }}>Creado</span>
                      ) : (
                        'Listo'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reporte && (
        <div className={`alert ${reporte.errores.length ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 16 }}>
          {reporte.creados} producto(s) creado(s)
          {reporte.errores.length ? `, ${reporte.errores.length} fila(s) con error (ver tabla arriba)` : '.'}
        </div>
      )}

      <div className="form-row">
        <Button type="button" variant="ghost" onClick={handleClose}>Cerrar</Button>
        <Button
          type="button"
          loading={importing}
          disabled={!rows.length || !pymeId}
          onClick={handleConfirm}
        >
          Confirmar importación
        </Button>
      </div>
        </>
      )}
    </Modal>
  );
}
