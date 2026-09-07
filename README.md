# Visor Bíblico 3D — Marcos 4:35-41

Reconstrucción del proyecto sobre Vite, con voz real (antes no existía),
tratamiento visual híbrido (3D en vivo + siluetas) y texto en Reina-Valera
1960, usado con el permiso general de Sociedades Bíblicas Unidas (ver
`src/data/scripture.js` para el detalle de esa licencia y por qué esta
perícopa sí califica sin pedir autorización escrita).

## ⚠️ Antes de nada: esto no se ha probado en un navegador real

Este código se escribió en un entorno sin acceso a red ni a pantalla —
pude verificar la estructura del proyecto, la sintaxis y la lógica
leyéndola con cuidado (de hecho corregí dos errores reales así: uno de
sincronización de versículo al saltar, otro de que pausar no silenciaba
el ambiente), pero **no lo he visto correr**. Trátalo como una primera
versión para probar, no como un hecho terminado.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre la URL que muestre la terminal (normalmente `http://localhost:5173`).

## Alternativa sin instalar nada localmente: GitHub Codespaces

Si tu computadora no puede correr esto localmente (ej. Windows 7, donde
Node.js moderno ya no instala), Codespaces corre todo en la nube — tu
máquina solo necesita un navegador.

**Aviso de navegador si usas Windows 7:** Chrome y Edge dejaron de
funcionar en Windows 7 desde 2023. Firefox es la única opción que
sigue recibiendo actualizaciones de seguridad ahí (rama de soporte
extendido, actualmente vigente al menos hasta marzo de 2027, aunque
Mozilla la ha ido revisando varias veces). Asegúrate de tener la
versión más reciente antes de empezar (Firefox → menú → Ayuda →
Acerca de Firefox).

1. **Crea una cuenta en github.com** si no tienes (botón "Sign up").
2. **Crea un repositorio nuevo:** botón "+" arriba a la derecha → "New
   repository" → nombre `visor-biblico-3d` → "Create repository".
3. **Sube los archivos:** en la página del repo recién creado, haz clic
   en el enlace "uploading an existing file". Descomprime primero el
   zip en tu PC (clic derecho → "Extraer todo"), y arrastra la carpeta
   completa `visor-biblico-3d` a la zona de subida — GitHub conserva las
   subcarpetas (`src/audio/`, `src/scene/`, etc.) automáticamente. Si
   arrastrar la carpeta entera falla, arrastra los archivos uno por uno
   (son solo 11). Luego "Commit changes".
4. **Abre Codespaces:** botón verde "Code" → pestaña "Codespaces" →
   "Create codespace on main". Espera 1-2 minutos mientras se prepara.
5. **En la terminal que aparece abajo** (o Terminal → New Terminal si no
   se ve): escribe `npm install`, espera, luego `npm run dev`.
6. Codespaces detectará el servidor y ofrecerá abrirlo en una pestaña
   nueva del navegador — ahí verás la app corriendo de verdad.

## Qué revisar primero al probarlo

1. **¿Se oye la voz al presionar "Iniciar"?** Es lo que arrancó todo esto.
2. **¿El texto se resalta palabra por palabra, o solo por versículo completo?**
   Depende de si tu navegador soporta el evento `boundary` de la Web
   Speech API — cualquiera de los dos es un resultado válido, solo hace
   falta saber cuál te tocó.
3. **¿La voz en español suena razonable?** Depende de las voces
   instaladas en tu sistema operativo/navegador.
4. **¿Pausar de verdad calla todo** (voz + viento + olas), y reanudar
   continúa bien?
5. **¿Los botones de versículo anterior/siguiente** resaltan el texto y
   cambian la escena correctas (no las de otro versículo)?
6. Visualmente: ¿las siluetas de la barca y las figuras se ven como tal,
   o hace falta ajustar materiales/luces? Esta es la parte más nueva y
   la que menos puedo garantizar sin verla.

## Estructura

```
index.html            — entrada, referencia src/main.js
src/main.js            — arranque
src/data/scripture.js  — texto RV1909 + etapa de cada versículo
src/audio/AudioEngine.js  — viento, oleaje, dron, trueno (ambiental)
src/audio/VoiceEngine.js  — narración (Web Speech API) — nuevo
src/scene/Scene3D.js      — océano + siluetas (enfoque híbrido)
src/app/AppController.js  — conecta todo + UI
```

## Pendiente (ver el documento maestro de contexto para el detalle completo)

- Confirmar en navegador todo lo de la lista de arriba
- Fase de accesibilidad real (aria-live, navegación por teclado) — quedó
  fuera de este alcance, a decidir si se retoma
- Revisar si conviene ajustar el ritmo/voz de la narración una vez la oigas

## Pendiente (ver el documento maestro de contexto para el detalle completo)

- Confirmar en navegador todo lo de la lista de arriba
- Fase de accesibilidad real (aria-live, navegación por teclado) — quedó
  fuera de este alcance, a decidir si se retoma
- Revisar si conviene ajustar el ritmo/voz de la narración una vez la oigas
