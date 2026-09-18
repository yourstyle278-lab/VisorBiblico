// Fuente: Reina-Valera 1960 (RVR1960).
//
// Cambio de traducción (Turno 6): se volvió a RVR1960 a pedido explícito
// del usuario. Se verificó primero que este uso SÍ está permitido sin
// pedir autorización escrita: Sociedades Bíblicas Unidas / American Bible
// Society autorizan citar hasta 500 versículos sin permiso por escrito,
// siempre que no sea más del 50% de un libro completo ni el 25% del texto
// total de la obra, y SIEMPRE que se incluya el aviso de derechos exigido
// (ver ATTRIBUTION más abajo, y dónde se muestra en README.md). Esta
// perícopa son solo 5 versículos — muy por debajo del límite. Fuente de
// la política: americanbible.org/rights-and-permissions,
// sba.org.ar/politica-sobre-derechos-y-permisos-de-uso-de-los-textos-biblicos.
// Nota: ese permiso general excluye uso "comercial" (venta/alquiler); si
// algún día la app se vendiera o llevara publicidad de pago, habría que
// pedir permiso por escrito aparte.
//
// Texto cotejado entre biblia.es/biblia-buscar-libros-1.php (RVR1960
// completo) y bible.com/bible/149/mrk.4.35-41.rvr1960 (versión oficial
// de American Bible Society) — coinciden.
//
// Se citan solo los versículos 35, 37, 38, 39 y 41 (se omiten 36 y 40),
// igual que en la selección original de este proyecto.
//
// "stage" reemplaza los tiempos fijos inventados de versiones anteriores:
// la escena y el ambiente sonoro cambian según qué versículo se está
// narrando de verdad, no según un cronómetro adivinado.

export const SCRIPTURE_REFERENCE = 'Marcos 4:35-41 (Reina-Valera 1960)';

// Aviso de derechos EXACTO exigido por el titular para poder usar el
// texto sin permiso escrito — no es contenido creativo, es la leyenda
// obligatoria que ellos mismos piden reproducir. Se muestra en la app
// (footer) y en el README.
export const SCRIPTURE_ATTRIBUTION =
  'El texto bíblico ha sido tomado de la versión Reina-Valera © 1960 ' +
  'Sociedades Bíblicas en América Latina; © renovado 1988 Sociedades ' +
  'Bíblicas Unidas. Utilizado con permiso. Reina-Valera 1960® es una ' +
  'marca registrada de Sociedades Bíblicas Unidas, y se puede usar ' +
  'solamente bajo licencia.';

// CAMBIO TURNO 11 (ruta: src/data/scripture.js): se agregó el campo
// "exegesis" a cada versículo — pedido explícito del usuario tras ver el
// panel "Exégesis Teológica Visual y Acústica" de los ejemplos de Gemini.
// Es texto propio, no tomado de Gemini ni de ninguna fuente externa: una
// frase breve por versículo, ceñida a lo que el texto mismo narra, sin
// añadir interpretación especulativa (mismo criterio que ya rige toda
// la app). Rol 📜 Contenido Bíblico/Teológico.
export const SCRIPTURE_PERICOPE = [
  {
    verse: 35,
    text: 'Aquel día, cuando llegó la noche, les dijo: Pasemos al otro lado.',
    stage: 'storm-building',
    exegesis: 'Jesús decide cruzar al otro lado del lago; la travesía comienza sin ninguna señal todavía de la prueba que se acerca.',
  },
  {
    verse: 37,
    text: 'Pero se levantó una gran tempestad de viento, y echaba las olas en la barca, de tal manera que ya se anegaba.',
    stage: 'storm-peak',
    exegesis: 'La tempestad se levanta de repente sobre el lago de Galilea, y las olas comienzan a entrar en la barca.',
  },
  {
    verse: 38,
    text: 'Y él estaba en la popa, durmiendo sobre un cabezal; y le despertaron, y le dijeron: Maestro, ¿no tienes cuidado que perecemos?',
    stage: 'storm-peak',
    exegesis: 'En medio del peligro, Jesús duerme en la popa; sus discípulos, temiendo perecer, lo despiertan.',
  },
  {
    verse: 39,
    text: 'Y levantándose, reprendió al viento, y dijo al mar: Calla, enmudece. Y cesó el viento, y se hizo grande bonanza.',
    stage: 'command',
    exegesis: 'Una sola palabra suya basta: "Calla, enmudece." El viento cesa y sobreviene una grande bonanza.',
  },
  {
    verse: 41,
    text: 'Entonces temieron con gran temor, y se decían el uno al otro: ¿Quién es éste, que aun el viento y el mar le obedecen?',
    stage: 'calm',
    exegesis: 'Sobrecogidos, los discípulos se preguntan entre sí quién es este a quien hasta el viento y el mar obedecen.',
  },
];
