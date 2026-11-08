# AI2IA

Diálogos entre dos modelos de IA con Next.js. Elige un tema y los modelos, inicia la conversación e intervén como observador.

## Interacción en tiempo real

Tu comentario aparece al enviarlo e interrumpe la respuesta en curso. Se vuelve a consultar al mismo modelo con la instrucción nueva; el otro modelo también la recibe. Puedes enviar varios comentarios. En pausa se conservan hasta reanudar.

Detener cancela también la primera respuesta. Las respuestas de diálogos anteriores no modifican una sesión nueva. Cada petición tiene un límite de 60 segundos; si el proveedor no responde, aparece un error y puedes iniciar otro diálogo. La cancelación se propaga al proveedor, aunque éste podría cobrar el trabajo ya iniciado.

El modo finito genera 29 intervenciones de IA (apertura + 14 pares). Los comentarios pendientes pueden prolongarlo hasta entregarse a ambos modelos. La exportación Markdown cuenta por separado respuestas y comentarios, e identifica los modelos seleccionados.

La documentación de aprendizaje y el informe de cambios están en [docs/README.md](docs/README.md). Es documentación local excluida de nuevos añadidos mediante `.gitignore`; no se realizan commits ni se modifica el índice de Git.

## Iniciar en local

```bash
npm install
npm run dev -- --hostname 127.0.0.1
```

Abre <http://localhost:3000>.

## Usar tu clave API (BYOK)

1. Selecciona los modelos A y B.
2. Introduce tu clave en el campo de cada proveedor seleccionado. Si ambos modelos usan el mismo proveedor, basta una clave.
3. Inicia el dialogo.

Las claves se mantienen en memoria mientras la pagina siga abierta; no se guardan en localStorage, cookies ni en el log exportado. Se envian al servidor de esta aplicacion, que las reenvia exclusivamente al proveedor seleccionado. Usa HTTPS si despliegas la aplicacion.

Si dejas un campo vacio, se usa la variable de entorno del proveedor en `.env.local` (ver `.env.example`). Una clave introducida tiene prioridad; si es rechazada, no se reintenta con la clave del servidor. Ollama local no necesita clave.

## Modelos gratuitos

Puedes crear una [clave de OpenRouter](https://openrouter.ai/settings/keys) y seleccionar **OpenRouter gratuito (automatico)** en A y B. El modelo `openrouter/free` elige entre los modelos gratuitos disponibles. El acceso tiene [limites de uso](https://openrouter.ai/docs/api_reference/limits); crear una clave no hace gratuitos los modelos de pago.

No se distribuyen claves compartidas. El catalogo de modelos individuales puede cambiar segun cada proveedor.

## Comprobaciones

```bash
npm test
npm run lint
npm run build
npm run typecheck
```

Las pruebas usan proveedores simulados y no consumen credito. Ejecuta build y typecheck en secuencia porque Next.js regenera `.next/types`.

La aplicacion no incorpora autenticacion ni cuotas de usuarios. Antes de publicarla con claves del servidor, restringe el acceso.
