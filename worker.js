// Whisper в фоновом потоке. Все файлы берутся с локального диска (vendor/ и models/).
import { pipeline, env } from './transformers.min.js';

// Сначала ищем модель рядом со страницей (models/), если её нет, один раз скачиваем
// с huggingface.co и сохраняем в память браузера. Дальше интернет не нужен.
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = true;
env.localModelPath = new URL('./models/', self.location.href).href;

const wasm = env.backends.onnx.wasm;
wasm.wasmPaths = new URL('./', self.location.href).href;
wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

let asr = null;
const lastProgress = {};

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-' + m.size, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress') {
            lastProgress[p.file] = p.progress;
            const v = Object.values(lastProgress);
            self.postMessage({ type: 'progress', pct: v.reduce((a, b) => a + b, 0) / v.length });
          }
        },
      });
      // прогрев: первый вызов всегда медленнее
      await asr(new Float32Array(16000), { language: 'russian', task: 'transcribe' });
      self.postMessage({ type: 'ready', threads: wasm.numThreads });
    } else if (m.type === 'run') {
      const opts = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
      if (m.lang && m.lang !== 'auto') opts.language = m.lang;
      const r = await asr(m.audio, opts);
      self.postMessage({ type: 'result', id: m.id, text: (r.text || '').trim() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, where: m.type, message: String((err && err.message) || err) });
  }
};
