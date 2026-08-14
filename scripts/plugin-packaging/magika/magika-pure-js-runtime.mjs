import { Magika } from "magika";
import * as tf from "@tensorflow/tfjs";
import { writeSync } from "node:fs";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const trace = (stage) => {
  if (process.env.SV_MAGIKA_SMOKE_TRACE === '1') process.stderr.write(`[magika-runtime] ${stage}\n`);
};

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--model-dir' && i + 1 < argv.length) args.modelDir = argv[++i];
    else if (argv[i] === '--config-dir' && i + 1 < argv.length) args.configDir = argv[++i];
    else if (argv[i] === '--input' && i + 1 < argv.length) args.input = argv[++i];
    else if (argv[i] === '--output-json') args.outputJson = true;
  }
  return args;
}

async function loadLocalModel(magika, modelDir, configDir) {
  const modelJson = JSON.parse(await fs.readFile(path.join(modelDir, 'model.json'), 'utf8'));
  const config = JSON.parse(await fs.readFile(path.join(configDir, 'config.min.json'), 'utf8'));
  const weightSpecs = modelJson.weightsManifest.flatMap((group) => group.weights);
  const weightFiles = modelJson.weightsManifest.flatMap((group) => group.paths.map((name) => path.join(modelDir, name)));
  const weightBuffers = await Promise.all(weightFiles.map((name) => fs.readFile(name)));
  const weightData = Buffer.concat(weightBuffers);
  const handler = tf.io.fromMemory({
    modelTopology: modelJson.modelTopology,
    weightSpecs,
    weightData: weightData.buffer.slice(weightData.byteOffset, weightData.byteOffset + weightData.byteLength),
    format: modelJson.format,
    generatedBy: modelJson.generatedBy,
    convertedBy: modelJson.convertedBy,
    signature: modelJson.signature,
  });
  magika.model_config.setConfig(config);
  magika.model_config.loaded = true;
  magika.model.model = await tf.loadGraphModel(handler);
}

async function main() {
  trace('started');
  const args = parseArgs(process.argv);
  if (!args.modelDir || !args.input) {
    process.stderr.write("usage: node runtime.mjs --model-dir <dir> --input <file> [--config-dir <dir>] [--output-json]\n");
    process.exit(1);
  }

  await tf.setBackend("cpu");
  await tf.ready();
  trace('tf-ready');

  const magika = new Magika();
  await loadLocalModel(magika, args.modelDir, args.configDir || args.modelDir);
  trace('model-loaded');
  const inputBytes = await fs.readFile(args.input);
  const result = await magika.identifyBytes(new Uint8Array(inputBytes));
  trace('classified');
  const output = {
    label: result.prediction?.output?.label ?? "unknown",
    score: result.prediction?.score ?? 0,
    modelVersion: Magika.MODEL_VERSION ?? "unknown",
  };
  const serialized = JSON.stringify(output);
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage({ kind: 'starverse-magika-result-v1', json: serialized });
  } else {
    writeSync(1, serialized);
  }
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`classify error: ${e.message}\n`);
  process.exit(1);
});
