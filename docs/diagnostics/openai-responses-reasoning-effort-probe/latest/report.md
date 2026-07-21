# OpenAI Responses o-series reasoning.effort probe

Generated at: 2026-07-07T22:31:19.365Z
Model source: --models
No /models discovery performed: yes

## Tested Models
- o3

## Skipped Models

- none

## Support Matrix

### o3

| Case | Result | HTTP | Provider Code | Message | Preview |
| --- | --- | --- | --- | --- | --- |
| n/a | skipped_builder_not_supported |  |  | Diagnostic did not send requests because provider credential/config could not be read. |  |

## o3 Result

- o3 was selected for a non-streaming probe, but no request was sent because provider credential/config could not be read.

## Required Checks
- omitted success: not tested
- auto_negative failure: not tested

## Current Config Replay

- not run

## Policy Recommendation

- `auto` must be represented in Starverse as omitted `reasoning.effort`, never as the provider wire value `"auto"`.
- o-series models should only expose explicit effort values that this probe reports as `supported` for the same model.
- Failed effort values should fail-before-fetch in Starverse policy once the policy is updated.
- Pro models remain forbidden for this probe and no capability should be inferred for them from these results.

## Notes

- configPath=[redacted-user-data]/config.json
- proxyPolicy=applied:system
- current-config replay sends only model/input/stream=false plus resolved reasoning.effort; non-reasoning generation parameters are intentionally omitted by this diagnostic scope
- model source: --models argument; no /models discovery performed
- credential=decrypt failed: Error while decrypting the ciphertext provided to safeStorage.decryptString.

