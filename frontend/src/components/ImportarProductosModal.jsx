import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Modal, Button, ErrorBox } from './ui';
import { productosApi } from '../api';

const COLUMNAS = ['nombre', 'codigo', 'categoria', 'precioVenta', 'costo', 'stockActual', 'stockMinimo', 'ventas'];

function descargarPlantilla() {
  const encabezado = COLUMNAS.join(',');
  const ejemplo = 'Arroz 1kg,ARZ-001,Granos,4500,3200,50,10,0';
  const contenido = `${encabezado}\n${ejemplo}\n`;
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-productos.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function filaTieneProblema(fila) {
  const problemas = [];
  if (!String(fila.nombre || '').trim()) problemas.push('falta nombre');
  if (fila.precioVenta === '' || Number.isNaN(Number(fila.precioVenta))) problemas.push('precioVenta inválido');
  if (fila.costo === '' || Number.isNaN(Number(fila.costo))) problemas.push('costo inválido');
  return problemas;
}

export default function ImportarProductosModal({ open, onClose, pymes, onImported }) {
  const [pymeId, setPymeId] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [reporte, setReporte] = useState(null);

  const reset = () => {
    setFileName('');
    setRows([]);
    setParseError(null);
    setReporte(null);
  };

  const handleClose = () => {
    reset();
    setPymeId('');
    onClose();
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
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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

  return (
    <Modal open={open} title="Importar productos por Excel/CSV" onClose={handleClose}>
      <ErrorBox error={parseError} />

      <div className="form-group">
        <label>PYME de destino</label>
        <select value={pymeId} onChange={(e) => setPymeId(e.target.value)} required>
          <option value="">Selecciona una PYME</option>
          {pymes.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <Button type="button" variant="ghost" onClick={descargarPlantilla}>
          Descargar plantilla (.csv)
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
    </Modal>
  );
}
