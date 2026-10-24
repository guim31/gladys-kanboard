# Vikunja

Las tareas de su [Vikunja](https://vikunja.io) en Gladys: lo que queda por
hacer hoy, lo que está atrasado, la próxima tarea de cada proyecto. Una escena
reacciona cuando una tarea vence o suena un recordatorio, otra añade «comprar
pan» desde un botón, un toque en el panel marca una tarea como hecha, y Gladys
puede leerle las tareas del día cada mañana.

> **Sus comentarios son bienvenidos.** Esta integración se ha probado con un
> servidor Vikunja real (imagen Docker `vikunja/vikunja` v2.7.0, octubre de
> 2026), todavía no en el uso diario. Si algo no funciona como se describe,
> indíquelo en el [foro de Gladys](https://community.gladysassistant.com) o en
> las [issues](https://github.com/guim31/gladys-vikunja/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un **Vikunja autoalojado** (0.22 o posterior), accesible desde Gladys (la
  imagen Docker escucha en el puerto 3456).
- Un **token de API** de un usuario de Vikunja. En Vikunja: **Settings** →
  **API Tokens** → **Create a token**, dele un nombre (`Gladys`), una fecha de
  caducidad y estos permisos:
  - **Projects**: `read_all`;
  - **Tasks**: `read_all`, `read_one`, `update` (para marcar tareas como
    hechas) y `create` (para crear tareas).

  Copie el token, que empieza por `tk_`: Vikunja solo lo muestra una vez. Sin
  `update` o `create`, los contadores, el widget y los disparadores funcionan;
  solo se rechaza la acción correspondiente.

La integración ve los proyectos y tareas que ve este usuario (los suyos y los
compartidos con él), y actúa **en su nombre**.

## Instalación

1. En Gladys, **Integraciones** → instale **Vikunja**.
2. En la pantalla **Configuración**, rellene:
   - **Dirección**: la dirección de Vikunja, por ejemplo
     `http://192.168.1.20:3456`, o `https://tareas.example.org` detrás de un
     proxy inverso (un prefijo como `/vikunja` se conserva);
   - **Token de API**: el token `tk_…`.
3. Opciones:
   - **Proyectos seguidos**: nombres o números separados por comas
     (`Casa, 3`). Vacío: todos los proyectos. Los proyectos archivados nunca
     se siguen;
   - **Aceptar certificados autofirmados**: para una dirección `https://` con
     certificado autofirmado, solo en su propio servidor;
   - **Intervalo de actualización**: de 1 a 10 minutos (5 por defecto). Los
     vencimientos, los recordatorios y la medianoche se siguen siempre a
     tiempo, sea cual sea el intervalo;
   - **Idioma de los nombres de funciones**: los nombres de las funciones al
     añadir un dispositivo (francés por defecto) y los textos enviados a las
     escenas.
4. Guarde y luego **Probar la conexión**: la integración lee Vikunja e indica
   su versión, el número de tareas abiertas y de proyectos seguidos.
5. En la pestaña **Descubrimiento**, añada los dispositivos que desee.

## Dispositivos

**Vikunja** (todos los proyectos seguidos juntos) y **Vikunja _proyecto_**
para cada proyecto seguido. Cada uno tiene cuatro funciones:

| Función            | Lo que indica                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `Tareas abiertas`  | tareas no hechas, con o sin vencimiento                                                       |
| `Tareas para hoy`  | tareas abiertas que vencen antes de medianoche, atrasadas incluidas: lo que queda por hacer   |
| `Tareas atrasadas` | tareas abiertas cuyo vencimiento ha pasado                                                    |
| `Próxima tarea`    | el título de la tarea abierta con el vencimiento más cercano aún por llegar; si no, `Ninguna` |

«Hoy» es el día en la zona horaria de Gladys. Un subproyecto es un proyecto
propio: sus tareas no cuentan en su proyecto padre.

## Panel

El widget **Tareas del día** muestra dos mosaicos (para hoy, atrasadas), la
lista de las tareas del día, las atrasadas primero, con su hora (en naranja si
la prioridad es alta) y su proyecto, y un botón para cada una de las cuatro
más urgentes: un toque marca la tarea como hecha. Elija un dispositivo de
proyecto en la configuración del widget para ver solo sus tareas; déjelo
vacío para todos los proyectos seguidos. Cuando no queda nada, el widget lo
dice e indica la próxima tarea.

Los contadores también pueden ir al panel como cualquier función de
dispositivo.

## Escenas

### Disparadores

- **Tarea de Vikunja vencida**: una tarea abierta ha llegado a su hora de
  vencimiento.
- **Recordatorio de tarea de Vikunja**: ha sonado un recordatorio de una tarea
  abierta (fecha fija, o relativa al vencimiento: Vikunja la calcula).
- **Tarea de Vikunja atrasada**: a medianoche, una tarea que vencía ese día
  sigue sin hacerse. Una vez por tarea y vencimiento.

Filtros, para los tres: el proyecto (un dispositivo de proyecto: el
dispositivo **Vikunja** no filtra nada, deje el campo vacío para todos los
proyectos), el título de la tarea. Información transmitida a las acciones: la tarea, su número, su
proyecto, su prioridad (0 a 5), su vencimiento; y la hora del recordatorio
para un recordatorio.

Una tarea hecha antes de su vencimiento no dispara nada. Un vencimiento movido
a mano a un momento anterior a la lectura previa tampoco: solo cuentan los momentos que pasan mientras la
integración funciona. Un reinicio no dispara nada dos veces; un momento que
pasó mientras la integración estaba detenida dispara al reiniciarse, si tiene
menos de una hora.

### Acciones

- **Marcar una tarea de Vikunja como hecha**: indique el **título** exacto
  (sin distinguir mayúsculas ni acentos) o el **número** de la tarea (`#12`,
  el número en la dirección de la tarea en Vikunja). Cualquier tarea abierta
  que vea el token, de un proyecto seguido o no. Una tarea repetida pasa a su
  próximo vencimiento, como en Vikunja. Resultados: la tarea, su número, su
  proyecto, el próximo vencimiento de una tarea repetida.
- **Crear una tarea de Vikunja**: un título, y el proyecto por nombre o número
  (vacío: el primer proyecto de la lista en Vikunja, normalmente Inbox).
  Resultados: la tarea, su número, su proyecto.
- **Leer las tareas de Vikunja del día**: las tareas del día en una frase
  (`4 tarea(s) para hoy: …. 2 atrasada(s).`), para todos los proyectos
  seguidos o uno de ellos. Resultados: la frase, el número de tareas para hoy
  y de tareas atrasadas. Envíe la frase en un mensaje, o haga que Gladys la
  diga.

Los campos aceptan variables de escena: `{{triggerEvent.data.task_id}}` marca
como hecha la tarea que disparó la escena.

### Ideas de escenas

- A las 7:30, **Leer las tareas de Vikunja del día** y enviar la frase por
  Telegram.
- **Recordatorio de tarea de Vikunja** en el proyecto `Compras`: hacer
  parpadear la luz de la entrada.
- Un botón junto a la puerta lanza **Crear una tarea de Vikunja** con
  `Comprar pan` en `Compras`.
- Una etiqueta NFC en los contenedores lanza **Marcar una tarea de Vikunja
  como hecha** con `Sacar la basura`.

## Solución de problemas

- **«Vikunja no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys (`http://<dirección>:3456` abre Vikunja en un navegador).
- **«Token de API rechazado o sin un permiso»**: el token ha caducado, se ha
  borrado o se copió mal, o le falta un permiso de la lista anterior. Vikunja
  responde igual en todos los casos: cree un token nuevo con todos los
  permisos indicados.
- **«No hay ninguna API de Vikunja en esta dirección»**: la dirección responde,
  pero no con la API de Vikunja: compruebe el puerto, o el prefijo detrás de
  un proxy inverso.
- **«La dirección redirige»**: introduzca la dirección `https://`.
- **Falta un proyecto**: los proyectos archivados no se siguen; un nombre
  escrito en **Proyectos seguidos** que no corresponde a ningún proyecto se
  ignora, y **Probar la conexión** lo indica.
- **«Varias tareas abiertas tienen este título»**: indique el número (`#12`).
- Registros: `LOG_LEVEL=debug` en el contenedor muestra cada lectura.

## Límites

- Vikunja se lee cada 1 a 10 minutos (y en cada vencimiento, cada
  recordatorio y a medianoche): una tarea hecha en Vikunja aparece en Gladys
  en ese plazo. No se usan los webhooks de Vikunja.
- Dos solicitudes por lectura (proyectos, tareas abiertas), más una por cada
  página adicional de 50 tareas. Se leen hasta 20 páginas de tareas abiertas.
- La integración marca tareas como hechas y crea tareas; no las modifica,
  borra, mueve ni asigna.
- Probada con Vikunja v2.7.0. Las versiones 0.22 a 0.24 deberían funcionar (la
  lista de tareas es allí `/tasks/all`, usada cuando `/tasks` no existe), pero
  no se han probado.
- Gladys no guarda datos de Vikunja salvo `/data/vikunja-state.json` (la hora
  de la última lectura, para que ningún evento se dispare dos veces).
- Sin relación con Vikunja.
