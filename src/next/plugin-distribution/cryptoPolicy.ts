export const SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS = ['ed25519'] as const
export type SupportedPluginCryptoSignatureAlgorithm =
  (typeof SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS)[number]
