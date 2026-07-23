import {
  isDynamicCapabilityHardExpiredV2,
  isModelRetiredV2,
  type DynamicCapabilityEvidenceV2,
  type ModelRetirementEvidenceV2,
} from './contractEvidenceV2'

export class ContractEvidenceRuntimeV2Error extends Error {
  constructor(readonly code: 'DYNAMIC_CAPABILITY_HARD_EXPIRED' | 'MODEL_RETIRED') {
    super(code)
    this.name = 'ContractEvidenceRuntimeV2Error'
  }
}

/** Contract review due is a release-governance signal, never a runtime block. */
export function assertRuntimeEvidenceUsableV2(input: Readonly<{
  nowMs: number
  dynamicCapability?: DynamicCapabilityEvidenceV2 | null
  modelRetirement?: ModelRetirementEvidenceV2 | null
}>): void {
  if (input.dynamicCapability && isDynamicCapabilityHardExpiredV2(input.dynamicCapability, input.nowMs)) {
    throw new ContractEvidenceRuntimeV2Error('DYNAMIC_CAPABILITY_HARD_EXPIRED')
  }
  if (input.modelRetirement && isModelRetiredV2(input.modelRetirement, input.nowMs)) {
    throw new ContractEvidenceRuntimeV2Error('MODEL_RETIRED')
  }
}
