import {
  ENGINE_CAPABILITIES,
  type EngineAvailability,
  type EngineCapability,
  type EngineCapabilityAvailability,
  type EngineRouteAvailability,
  type ExternalEngineRecord,
} from './externalEngineTypes'

const CAPABILITIES = ENGINE_CAPABILITIES

export function computeEngineAvailability(
  engines: readonly ExternalEngineRecord[],
  diagnostics: EngineAvailability['diagnostics'] = []
): EngineAvailability {
  const capabilityAvailability = buildCapabilityAvailability(engines)
  return {
    engines,
    diagnostics,
    capabilityAvailability,
    routeAvailability: toRouteAvailability(capabilityAvailability),
  }
}

export function buildCapabilityAvailability(
  engines: readonly ExternalEngineRecord[]
): EngineCapabilityAvailability {
  const enabledHealthy = engines.filter((engine) => engine.enabled && engine.healthStatus === 'healthy')
  const map = {} as Record<EngineCapability, boolean>
  for (const capability of CAPABILITIES) {
    map[capability] = enabledHealthy.some((engine) => engine.capabilities.includes(capability))
  }
  return map
}

export function toRouteAvailability(
  capabilityAvailability: EngineCapabilityAvailability
): EngineRouteAvailability {
  return {
    documentConversion: capabilityAvailability.document_conversion,
    spreadsheetConversion: capabilityAvailability.spreadsheet_conversion,
    presentationConversion: capabilityAvailability.presentation_conversion,
    renderedImages: capabilityAvailability.rendered_images,
    textExtraction: capabilityAvailability.text_extraction,
    audioExtraction: capabilityAvailability.audio_extraction,
    frameSelection: capabilityAvailability.frame_selection,
  }
}
