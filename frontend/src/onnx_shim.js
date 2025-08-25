// frontend/src/onnx_shim.js
import * as ortWeb from 'onnxruntime-web/webgpu'; // ensure this is installed in frontend

// Simple registry (you could fetch JSON instead)
const MODEL_REGISTRY = {
  candy: { file: '/models/candy-9.onnx', inputName: null, outputName: null, recommended_px: 512 },
  mosaic: { file: '/models/mosaic-9.onnx', inputName: null, outputName: null, recommended_px: 512 },
  udnie: { file: '/models/udnie-9.onnx', inputName: null, outputName: null, recommended_px: 512 },
};

const SESSIONS = {};

async function ensureSession(styleId) {
  if (SESSIONS[styleId]) return SESSIONS[styleId];
  const entry = MODEL_REGISTRY[styleId];
  if (!entry) throw new Error('Unknown style: ' + styleId);

  // create session with WebGPU execution provider
  const session = await ortWeb.InferenceSession.create(entry.file, {
    executionProviders: ['webgpu'],
  });
  // store discovered io names if not provided
  entry.inputName = entry.inputName || session.inputNames[0];
  entry.outputName = entry.outputName || session.outputNames[0];
  SESSIONS[styleId] = session;
  return session;
}

// exported function called by Rust via wasm_bindgen
export async function run_onnx_model(styleId, float32Input, n, c, h, w) {
  const session = await ensureSession(styleId);
  const inputName = MODEL_REGISTRY[styleId].inputName || session.inputNames[0];
  const outputName = MODEL_REGISTRY[styleId].outputName || session.outputNames[0];

  // float32Input is a Float32Array (NCHW flattened)
  // Construct ort.Tensor
  const x = new ortWeb.Tensor('float32', float32Input, [n, c, h, w]);

  const feeds = {};
  feeds[inputName] = x;

  const outputs = await session.run(feeds);
  const y = outputs[outputName];

  // y.data is a TypedArray (Float32Array). Return that directly to Rust
  return y.data; // wasm_bindgen will receive that as a Float32Array via Promise
}