# FUT Bot - Bot de Discord

Este proyecto contiene un bot de Discord básico desarrollado con Node.js y `discord.js` v14.

## Requisitos Previos

1. Tener Node.js v16.9.0 o superior instalado.
2. Tener una cuenta de Discord y haber habilitado el **Modo Desarrollador**.

## Configuración Inicial

1. Entra al Portal de Desarrolladores de Discord: [Discord Developer Portal](https://discord.com/developers/applications).
2. Crea una **New Application** con el nombre de tu bot (ej. `FUT Bot`).
3. Ve a la sección **Bot** en el menú izquierdo:
   - Haz clic en **Reset Token** para obtener el Token del bot. Cópialo.
   - En la sección **Privileged Gateway Intents**, activa **Guild Messages** e **Message Content** (opcional, pero recomendado).
4. Ve a la sección **OAuth2** -> **General** en el menú izquierdo:
   - Copia el **Client ID** (Application ID).
5. Abre el archivo [.env](file:///c:/Users/Javi/Desktop/fut.bot/.env) en este proyecto y rellena los campos:
   - `DISCORD_TOKEN`: Pega el Token del bot.
   - `CLIENT_ID`: Pega el Client ID.
   - `GUILD_ID`: (Opcional pero recomendado para pruebas rápidas) El ID de tu servidor de Discord para que los comandos se actualicen de inmediato.

## Invitar al Bot a tu Servidor

1. En el Portal de Desarrolladores de Discord, ve a **OAuth2** -> **URL Generator**.
2. En **Scopes**, selecciona `bot` y `applications.commands`.
3. En **Bot Permissions**, selecciona los permisos necesarios (ej. `Send Messages`, `Use Slash Commands`).
4. Copia la URL generada al final de la página, ábrela en tu navegador e invita al bot a tu servidor.

## Comandos

1. **Registrar Comandos**: Antes de iniciar el bot o cuando crees nuevos comandos slash, debes registrarlos ejecutando:
   ```bash
   npm run register
   ```
2. **Iniciar el Bot**: Para arrancar el bot en modo local:
   ```bash
   npm start
   ```

Una vez encendido, prueba escribiendo `/hola` o `/ping` en un canal de tu servidor de Discord.
