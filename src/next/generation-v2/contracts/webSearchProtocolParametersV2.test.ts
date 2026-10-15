import { describe, expect, it } from 'vitest'
import { resolveWebSearchProtocolParametersV2, validateWebSearchProtocolParametersV2 } from '../../../core/generation-v2/contracts/webSearchProtocolParametersV2'
import type { WebSearchIntentV2 } from '../../../core/generation-v2/domain/generationIntentV2'

const bindings = {
  anthropic:{providerId:'anthropic',protocolContractId:'anthropic-messages-2023-06-01',operation:'text' as const},
  openrouter:{providerId:'openrouter',protocolContractId:'openrouter-chat-completions-v1',operation:'text' as const},
  responses:{providerId:'openai_responses',protocolContractId:'openai-responses-v1',operation:'text' as const},
  generateContent:{providerId:'google_ai_studio',protocolContractId:'gemini-generate-content-v1beta',operation:'text' as const},
  interactions:{providerId:'google_ai_studio',protocolContractId:'gemini-interactions-v1beta',operation:'image_generate' as const},
}
describe('registered web-search wire parameters',()=>{
  it('returns exact protocol domains without asserting model support',()=>{
    expect(resolveWebSearchProtocolParametersV2(bindings.anthropic)).toEqual({types:{kind:'enum_list',values:['web'],maxItems:1},optionalParameters:{maxResults:{kind:'range',min:1,max:20,integer:true}}})
    expect(resolveWebSearchProtocolParametersV2(bindings.openrouter)).toEqual({types:{kind:'enum_list',values:['web'],maxItems:1},optionalParameters:{
      engine:{kind:'enum',values:['auto','native','exa','firecrawl','parallel','perplexity']},maxResults:{kind:'range',min:1,max:25,integer:true},searchContextSize:{kind:'enum',values:['low','medium','high']}}})
    expect(resolveWebSearchProtocolParametersV2(bindings.responses).optionalParameters).toEqual({searchContextSize:{kind:'string',maxLength:4096}})
    expect(resolveWebSearchProtocolParametersV2(bindings.generateContent).optionalParameters).toEqual({})
    expect(resolveWebSearchProtocolParametersV2(bindings.interactions)).toEqual({types:{kind:'enum_list',values:['web','image'],maxItems:2},optionalParameters:{}})
    expect(Object.isFrozen(resolveWebSearchProtocolParametersV2(bindings.openrouter).optionalParameters.engine)).toBe(true)
  })
  it('validates exact provider, registered contract and operation rather than provider alone',()=>{
    for(const invalid of [{...bindings.anthropic,providerId:'openrouter'},{...bindings.openrouter,protocolContractId:'unknown'},
      {...bindings.generateContent,operation:'image_generate' as const},{...bindings.interactions,operation:'text' as const}]) {
      expect(()=>resolveWebSearchProtocolParametersV2(invalid)).toThrow('GENERATION_V2_WEB_SEARCH_PROTOCOL_BINDING_INVALID')
    }
    expect(()=>resolveWebSearchProtocolParametersV2({providerId:'deepseek',protocolContractId:'deepseek-stable-chat-v1',operation:'text'})).toThrow('GENERATION_V2_WEB_SEARCH_PROTOCOL_UNSUPPORTED')
  })
  it('enforces Anthropic 1..20 and OpenRouter 1..25 plus engine/context enums',()=>{
    const web={mode:'provider_search' as const,types:['web' as const]}
    expect(()=>validateWebSearchProtocolParametersV2(bindings.anthropic,{...web,maxResults:20})).not.toThrow()
    expect(()=>validateWebSearchProtocolParametersV2(bindings.openrouter,{...web,maxResults:25,engine:'perplexity',searchContextSize:'high'})).not.toThrow()
    for(const maxResults of [0,21,1.5,Infinity,NaN]) expect(()=>validateWebSearchProtocolParametersV2(bindings.anthropic,{...web,maxResults})).toThrow('PARAMETERS_INVALID')
    for(const invalid of [{...web,maxResults:26},{...web,searchContextSize:'wide'},{...web,engine:'other'}]) {
      expect(()=>validateWebSearchProtocolParametersV2(bindings.openrouter,invalid as WebSearchIntentV2)).toThrow('PARAMETERS_INVALID')
    }
    expect(()=>validateWebSearchProtocolParametersV2(bindings.anthropic,{...web,engine:'native'})).toThrow('PARAMETERS_INVALID')
  })
  it('preserves Responses open context strings and rejects absent protocol optional parameters',()=>{
    const web={mode:'provider_search' as const,types:['web' as const]}
    expect(()=>validateWebSearchProtocolParametersV2(bindings.responses,{...web,searchContextSize:'future-context-preset'})).not.toThrow()
    expect(()=>validateWebSearchProtocolParametersV2(bindings.responses,{...web,searchContextSize:' future context '})).not.toThrow()
    expect(()=>validateWebSearchProtocolParametersV2(bindings.responses,{...web,searchContextSize:'x'.repeat(4096)})).not.toThrow()
    for(const searchContextSize of ['', 'x'.repeat(4097)]) expect(()=>validateWebSearchProtocolParametersV2(bindings.responses,{...web,searchContextSize})).toThrow('PARAMETERS_INVALID')
    for(const binding of [bindings.responses,bindings.generateContent,bindings.interactions]) {
      expect(()=>validateWebSearchProtocolParametersV2(binding,{...web,maxResults:1})).toThrow('PARAMETERS_INVALID')
    }
  })
  it('preserves the image operation types, disabled semantics and non-UI field checks for compiler ownership',()=>{
    expect(()=>validateWebSearchProtocolParametersV2(bindings.interactions,{mode:'provider_search',types:['web','image']})).not.toThrow()
    expect(()=>validateWebSearchProtocolParametersV2(bindings.generateContent,{mode:'provider_search',types:['image']})).toThrow('PARAMETERS_INVALID')
    expect(()=>validateWebSearchProtocolParametersV2(bindings.anthropic,{mode:'disabled'})).not.toThrow()
    expect(()=>validateWebSearchProtocolParametersV2(bindings.anthropic,{mode:'provider_search',types:['web'],allowedDomains:['example.invalid'],userLocation:{city:'Synthetic'}})).not.toThrow()
  })
})
