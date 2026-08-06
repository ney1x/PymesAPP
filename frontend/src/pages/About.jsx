import React from 'react';

export default function About() {
  return (
    <div>
      <h1>Sobre nosotros</h1>

      <div className="card" style={{ maxWidth: 700 }}>
        <p>
          Somos un equipo de 4 estudiantes de ingeniería de la Universidad Simón Bolívar
          de Barranquilla. Desarrollamos una plataforma web con herramientas y conocimientos
          vistos en la materia Proyecto Integrador I. El objetivo es ayudar a las pymes
          locales a controlar su inventario, disminuir pérdidas por sobrestock y optimizar
          los ingresos. Les permitimos tomar mejores decisiones de inventario.
        </p>

        <h3 style={{ marginTop: 24 }}>Participantes</h3>
        <p style={{ margin: '4px 0' }}>Antonio Arrieta, Pablo Arrieta, Santiago Perez, May salazar</p>

        <h3 style={{ marginTop: 24 }}>Institución</h3>
        <p style={{ margin: '4px 0' }}>Universidad Simón Bolívar, Facultad de ingeniería</p>

        <h3 style={{ marginTop: 24 }}>Docente</h3>
        <p style={{ margin: '4px 0' }}>Universidad Simón Bolívar, Facultad de ingeniería</p>
      </div>
    </div>
  );
}
