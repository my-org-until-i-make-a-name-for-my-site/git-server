const fs = require("fs");
const path = require("path");
const os = require("os");
const tf = require("@tensorflow/tfjs-node");
const readline = require("readline");

const REPO_ROOT = "Z:/mnt/repos";
const CHECKPOINT_FILE = "Z:/mnt/checkpoints/ai_checkpoint.txt";
const MODEL_DIR = "Z:/mnt/models/codara";

const CPU_LIMIT = 0.90;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per file
const SEQ_LEN = 128;

fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
fs.mkdirSync(MODEL_DIR, { recursive: true });

/* ---------------- CPU throttle ---------------- */
let lastCpu = os.cpus();
function cpuUsage() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (let i = 0; i < cpus.length; i++) {
    const prev = lastCpu[i].times;
    const curr = cpus[i].times;
    const prevTotal = Object.values(prev).reduce((a,b)=>a+b,0);
    const currTotal = Object.values(curr).reduce((a,b)=>a+b,0);
    idle += curr.idle - prev.idle;
    total += currTotal - prevTotal;
  }
  lastCpu = cpus;
  return 1 - idle / total;
}
async function waitForCpu() {
  while (cpuUsage() > CPU_LIMIT) {
    console.log("CPU > 90%, pausing...");
    await new Promise(r => setTimeout(r, 3000));
  }
}

/* ---------------- File walker ---------------- */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ---------------- Model ---------------- */
function createModel(vocabSize) {
  const model = tf.sequential();
  model.add(tf.layers.embedding({ inputDim: vocabSize, outputDim: 64, inputLength: SEQ_LEN }));
  model.add(tf.layers.lstm({ units: 128, returnSequences: true }));
  model.add(tf.layers.lstm({ units: 128 }));
  model.add(tf.layers.dense({ units: vocabSize, activation: "softmax" }));
  model.compile({ optimizer: tf.train.adam(0.001), loss: "sparseCategoricalCrossentropy" });
  return model;
}

/* ---------------- Training utils ---------------- */
function encodeText(text, charToIdx) {
  return Array.from(text)
    .map(c => charToIdx[c])
    .filter(v => v !== undefined);
}

function makeDataset(encoded) {
  const xs = [];
  const ys = [];
  for (let i = 0; i + SEQ_LEN < encoded.length; i += SEQ_LEN) {
    xs.push(encoded.slice(i, i + SEQ_LEN));
    ys.push(encoded[i + SEQ_LEN]);
  }
  return { xs: tf.tensor2d(xs, [xs.length, SEQ_LEN]), ys: tf.tensor1d(ys, "int32") };
}

/* ---------------- Interactive command ---------------- */
let trainingPaused = false;
let stopRequested = false;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (input) => {
  const cmd = input.trim().toLowerCase();
  if (cmd === "pause") {
    trainingPaused = true;
    console.log("Training paused.");
  } else if (cmd === "resume") {
    trainingPaused = false;
    console.log("Training resumed.");
  } else if (cmd === "stop") {
    stopRequested = true;
    console.log("Stopping after current file...");
  } else if (cmd === "status") {
    console.log(`Paused: ${trainingPaused}, Stop requested: ${stopRequested}`);
  } else {
    console.log("Commands: pause, resume, stop, status");
  }
});

/* ---------------- Main ---------------- */
async function main() {
  console.log("TensorFlow backend:", tf.getBackend());

  // Load checkpoint
  let processedFiles = new Set();
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const lines = fs.readFileSync(CHECKPOINT_FILE, "utf8").split("\n").filter(Boolean);
    processedFiles = new Set(lines);
  }

  // Get files
  const files = walk(REPO_ROOT).filter(f => !processedFiles.has(f));
  console.log(`Files remaining: ${files.length}`);

  // Build vocab
  const vocab = new Set();
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const c of text) vocab.add(c);
    } catch {}
  }
  const chars = Array.from(vocab);
  const charToIdx = Object.fromEntries(chars.map((c,i)=>[c,i]));
  const vocabSize = chars.length;

  console.log("Vocabulary size:", vocabSize);

  const model = createModel(vocabSize);

  for (const file of files) {
    if (stopRequested) break;

    while (trainingPaused) await new Promise(r => setTimeout(r, 1000));

    await waitForCpu();

    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;

      const text = fs.readFileSync(file, "utf8");
      if (text.length < SEQ_LEN*2) continue;

      const encoded = encodeText(text, charToIdx);
      const { xs, ys } = makeDataset(encoded);

      if (xs.shape[0] === 0) { xs.dispose(); ys.dispose(); continue; }

      console.log("Training on:", file);

      await model.fit(xs, ys, { epochs:1, batchSize:8, shuffle:true });

      fs.appendFileSync(CHECKPOINT_FILE, file + "\n");

      xs.dispose();
      ys.dispose();
      tf.disposeVariables();

    } catch(e) {
      console.log("Skipped:", file, e.message);
    }
  }

  // Save model
  await model.save(`file://${MODEL_DIR}`);
  console.log("Model saved to:", MODEL_DIR);
  rl.close();
}

main();
