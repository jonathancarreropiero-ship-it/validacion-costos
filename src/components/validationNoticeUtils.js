export function esAvisoCantidadesIncompletas(mensaje) {
  return typeof mensaje === 'string' && (
    mensaje.startsWith('Completa todas las cantidades del SKU ') ||
    mensaje === 'Completa todas las cantidades antes de validar.'
  )
}
