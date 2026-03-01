# OpenRouter Web Plugin Boundary Probe

- generatedAt: 2026-02-18T17:58:58.217Z
- outDir: D:\Starverse\artifacts\openrouter\web-plugin-boundary\20260219_015819
- keySource: appdata
- keyHash: 6a09729b98
- baseModel: google/gemini-2.5-flash
- nativeModel: x-ai/grok-3-mini-beta

## Matrix Quick View

| Case | Status | Annotations | Error |
|---|---:|---:|---|
| A_nonstream_web | 200 | 5 |  |
| A_stream_web | 200 | 5 |  |
| B_engine_auto | 200 | 5 |  |
| B_engine_native | 404 | 0 | No endpoints found that support native web search |
| B_engine_exa | 200 | 5 |  |
| C_context_high_exa | 200 | 5 |  |
| C_context_invalid_exa | 200 | 5 |  |
| C_context_high_native | 404 | 0 | No endpoints found that support native web search |
| D_baseline_no_plugins | 200 | 0 |  |
| D_plugins_enabled_false | 200 | 0 |  |
| D_plugins_enabled_true | 200 | 5 |  |
| EQ_suffix_online | 200 | 5 |  |
| EQ_suffix_online_plus_disable | 200 | 0 |  |
| EQ_plugins_object_shape | 400 | 0 | Invalid input: expected array, received object |
| B_native_model_probe | 404 | 0 | No endpoints found that support native web search |

## Notes
- D default-plugin verification requires account-side default web plugin ON. This script can only probe behavior under current account settings.
- If account has Prevent overrides enabled, request-level enabled:false may be ignored; verify with an account where that policy is enabled.

