export const name = 'clientReady';
export const once = true;

export function execute(client) {
  console.log(`¡Bot iniciado con éxito! Conectado como ${client.user.tag}`);
}
