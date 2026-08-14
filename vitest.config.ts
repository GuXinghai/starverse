// Backward-compatible default: ordinary `vitest` invocations use the node
// unit partition.  The UI and integration partitions have explicit configs.
export { default } from './vitest.unit.config'
