# Mnemónica Trainer

Aplicación móvil para aprender y automatizar la ordenación Mnemónica de Juan Tamariz.

## Funciones

- Carta → posición y posición → carta.
- Carta anterior, carta siguiente, desplazamientos, vecindario y secuencias.
- Respuesta directa o mediante opciones ocultas hasta que el usuario decide recordarlas.
- Sesiones de 10, 20 o 52 preguntas y entrenamiento continuo.
- Ruta progresiva por bloques y repaso de cartas débiles, lentas o atrasadas.
- Progreso por carta y por tipo de ejercicio.
- Cola local para seguir entrenando sin esperar a la sincronización.
- Aplicación web instalable y funcionamiento básico sin conexión.

## Arquitectura

- `app/`: interfaz estática y cliente de sincronización.
- `backend/Code.gs`: backend de Google Apps Script.
- `public/cards/standard/`: imágenes SVG de las cartas y su licencia.
- Google Sheets: sesiones, respuestas, usuarios, ajustes y ordenación.

La interfaz se publica en GitHub Pages y funciona sin servidor propio. La clave de Apps Script y el correo del usuario se introducen una vez desde **Ajustes → Google Sheets** y se guardan únicamente en el almacenamiento local del dispositivo. No se incluyen en Git ni en el código compilado.

## Desarrollo

Requiere Node.js 22 o posterior.

```bash
npm ci
npm run build
npm test
```

## Publicación en GitHub Pages

El workflow `.github/workflows/pages.yml` compila, prueba y publica automáticamente cada cambio enviado a `main`. En la configuración del repositorio hay que seleccionar **GitHub Actions** como origen de Pages.

Antes de usar la sincronización desde GitHub Pages, copia `backend/Code.gs` en el proyecto de Apps Script y crea una nueva versión de la implementación web. La versión 1.2 añade la comprobación de sesiones que permite confirmar guardados desde un navegador estático.

La aplicación siempre guarda primero en el dispositivo. Entrenar, terminar una sesión o empezar otra no espera a Google Sheets; la cola se sincroniza en segundo plano y reintenta cuando vuelve la conexión.

## Licencia de las cartas

Las imágenes de `public/cards/standard/` conservan el README y la licencia LGPL 3.0 de su repositorio de origen.
