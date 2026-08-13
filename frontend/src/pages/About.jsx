import React from 'react';

export default function About() {
  return (
    <div>
      <h1>Sobre nosotros</h1>

      <div className="card" style={{ maxWidth: 700 }}>
        <p>
          Somos un equipo de 4 estudiantes de ingeniería de la Universidad Simón Bolívar
          de Barranquilla. Desarrollamos una plataforma con herramientas y conocimientos
          con el objetivo de ayudar a las pymes
          locales a controlar su inventario, disminuir pérdidas por sobrestock y optimizar
          los ingresos. Les permitimos tomar mejores decisiones de inventario gracias a la prediccion de stock.
        </p>

        <h3 style={{ marginTop: 24 }}>Participantes</h3>
        <p style={{ margin: '4px 0' }}>Adriano Aragon, Pablo Arrieta, Santiago Perez, Ney salazar</p>

        <h3 style={{ marginTop: 24 }}>Institución</h3>
        <p style={{ margin: '4px 0' }}>Universidad Simón Bolívar, Facultad de ingeniería</p>

        <h3 style={{ marginTop: 24 }}>Docente</h3>
        <p style={{ margin: '4px 0' }}>NATASHA ISABEL MADERA SAMPER</p>
      </div>
    </div>
  );
}
