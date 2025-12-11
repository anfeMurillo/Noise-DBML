![NOISE DBML icon](src/resources/icon.png)

# NOISE DBML

NOISE DBML es una extensión de VS Code, publicada por **AndrsFelipeMurillo**, que te permite visualizar y manipular diagramas relacionales derivados de archivos DBML directamente en el editor.

## Características clave

- **Vista previa instantánea**: Abre un panel con el diagrama del archivo `.dbml` activo desde la barra del editor.
- **Render adaptable al tema**: Colores, tipografías y estados de foco se adaptan automáticamente al tema de VS Code.
- **Lienzo infinito con cuadrícula precisa**: Navega con pan y zoom, muestra una malla ajustable que respeta el nivel de zoom y alinea las tablas a un grid magnético.
- **Posiciones persistentes**: El estado del diagrama (posiciones, vista, zoom y cuadrícula) se guarda por archivo para mantener tu layout personalizado.
- **Grupos y vistas personalizadas**: Define grupos en DBML, alterna colapsado y crea conjuntos de tablas visibles mediante vistas guardadas.
- **Auto-organización flexible**: Tres algoritmos (Left-right, Snowflake, Compact) para reorganizar el diagrama según tu caso de uso.
- **Relaciones inteligentes**: Conexiones ortogonales, resaltado contextual y marcadores de cardinalidad (`1`, `0..1`, `*`).

## Primeros pasos

1. Instala la extensión NOISE DBML desde el Marketplace usando el identificador `AndrsFelipeMurillo.noise-dbml`.
2. Abre un archivo `.dbml` o crea uno nuevo.
3. Selecciona el botón con el ícono de ojo en la barra superior del editor o ejecuta el comando **DBML: Open Preview**.
4. Usa el panel lateral para explorar tablas, grupos y vistas guardadas.

> Consejo: el archivo `example.dbml` incluido en el repositorio sirve como punto de partida rápido.

## Controles del diagrama

- **Pan**: arrastra el lienzo en un área vacía.
- **Zoom**: rueda del mouse (el punto de zoom sigue al cursor).
- **Mover tablas**: arrastra una tabla; se alineará automáticamente a la cuadrícula.
- **Arrastrar grupos**: arrastra la cabecera del grupo para mover todas las tablas asociadas.
- **Cuadrícula**: alterna la visibilidad con el botón dedicado; la malla se ajusta al nivel de zoom.
- **Resaltado de relaciones**: al pasar el cursor sobre una tabla se resaltan sus relaciones activas.

## Funcionalidades adicionales

- **Auto Arrange**: abre el panel lateral y elige el algoritmo deseado para reorganizar el diagrama.
- **Diagram Views**: crea vistas con subconjuntos de tablas, renómbralas, elimínalas o restablece la vista completa.
- **Persistencia de layout**: se guarda un archivo `.layout.json` junto al `.dbml` con posiciones, vista y configuraciones.

## Ejemplo de DBML

```dbml
Table users {
  id int [pk]
  username varchar(50) [not null, unique]
  email varchar(120) [not null, unique]
  created_at timestamp [default: `now()`]
}

Table orders {
  id int [pk]
  user_id int [not null, ref: > users.id]
  total numeric(10,2) [not null]
  status varchar(20)
  created_at timestamp
}

Ref: orders.user_id > users.id [delete: cascade]
```

## Requisitos

- Visual Studio Code 1.107.0 o superior.
- Archivos `.dbml` escritos con la sintaxis oficial de [DBML](https://www.dbml.org/home/).

## Comandos disponibles

- **DBML: Open Preview** (`noise-dbml.openPreview`): abre o enfoca la vista previa del diagrama para el documento activo.

## Desarrollo y pruebas

1. Clona el repositorio y ejecuta `npm install`.
2. Usa `npm run compile` para construir la extensión.
3. Presiona `F5` en VS Code para abrir una ventana de desarrollo con NOISE DBML cargada.
4. Ejecuta `npm test` para correr los tests automatizados.

> Scripts útiles: `npm run watch` (compilación incremental), `npm run lint` (estilo) y `npm run package` (build optimizada).

## Soporte

Reporta issues o solicita nuevas funciones en el repositorio oficial. ¡Disfruta diagramando con NOISE DBML!
