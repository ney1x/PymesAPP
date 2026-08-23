import { createContext, useContext, useState, useMemo } from 'react';

// PYME actualmente seleccionada en el filtro del Dashboard (u otra pantalla
// que lo adopte). Vive en context porque el ChatWidget se monta en Layout,
// como hermano de las paginas — sin esto no hay forma de que el bot sepa
// que PYME esta viendo el usuario en ese momento.
const PymeFilterContext = createContext(null);

export function PymeFilterProvider({ children }) {
  const [pymeSeleccionada, setPymeSeleccionada] = useState('');

  const value = useMemo(() => ({ pymeSeleccionada, setPymeSeleccionada }), [pymeSeleccionada]);

  return (
    <PymeFilterContext.Provider value={value}>
      {children}
    </PymeFilterContext.Provider>
  );
}

export function usePymeFilter() {
  const ctx = useContext(PymeFilterContext);
  if (!ctx) throw new Error('usePymeFilter debe usarse dentro de PymeFilterProvider');
  return ctx;
}
