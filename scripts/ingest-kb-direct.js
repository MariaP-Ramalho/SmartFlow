const fs = require('fs');
const https = require('https');

const MONGODB_URI = process.env.MONGODB_URI || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

let mongoose;
try { mongoose = require('mongoose'); } catch { console.error('Run: npm install mongoose'); process.exit(1); }

const docSchema = new mongoose.Schema({
  title: String,
  content: String,
  category: String,
  source: String,
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed,
  embedding: [Number],
}, { timestamps: true, collection: 'knowledgedocuments' });

const KnowledgeDoc = mongoose.model('KnowledgeDocument', docSchema);

function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    });
    const req = https.request('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.data?.[0]?.embedding) resolve(j.data[0].embedding);
          else reject(new Error(`OpenAI error: ${data.slice(0, 300)}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function splitIntoChunks(text, maxSize = 3000) {
  const sections = text.split(/\n(?=\d+[\.\)]\s|#{1,3}\s)/);
  const chunks = [];
  let current = { title: '', content: '' };

  for (const sec of sections) {
    const lines = sec.trim().split('\n');
    const firstLine = lines[0]?.trim() || '';

    if (firstLine.length < 150 && firstLine.length > 2) {
      if (current.content.trim().length > 50) {
        chunks.push({ ...current });
      }
      current = { title: firstLine, content: sec.trim() };
    } else {
      current.content += '\n' + sec.trim();
    }

    if (current.content.length > maxSize) {
      chunks.push({ ...current });
      current = { title: '', content: '' };
    }
  }
  if (current.content.trim().length > 50) chunks.push(current);

  const result = [];
  for (const c of chunks) {
    if (c.content.length <= maxSize) {
      result.push(c);
    } else {
      const paras = c.content.split(/\n{2,}/);
      let buf = '';
      let idx = 1;
      for (const p of paras) {
        if (buf.length + p.length > maxSize && buf.length > 100) {
          result.push({ title: `${c.title} (pt ${idx})`, content: buf.trim() });
          buf = '';
          idx++;
        }
        buf += p + '\n\n';
      }
      if (buf.trim().length > 50) {
        result.push({ title: `${c.title}${idx > 1 ? ` (pt ${idx})` : ''}`, content: buf.trim() });
      }
    }
  }

  return result;
}

async function ingestFile(filePath, category, tags) {
  console.log(`\n--- ${category} ---`);
  const text = fs.readFileSync(filePath, 'utf-8');
  console.log(`  Size: ${(text.length / 1024).toFixed(0)} KB`);

  const chunks = splitIntoChunks(text);
  console.log(`  Chunks: ${chunks.length}`);

  let ok = 0, fail = 0;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const title = `[${category}] ${c.title || `Seção ${i + 1}`}`.slice(0, 200);

    try {
      const embedding = await getEmbedding(c.content);

      await KnowledgeDoc.create({
        title,
        content: c.content.slice(0, 8000),
        category,
        source: 'manual',
        tags,
        metadata: { file: filePath.split(/[/\\]/).pop(), chunkIndex: i },
        embedding,
      });

      ok++;
      process.stdout.write(`  [${ok}/${chunks.length}] ${title.slice(0, 60)}...\r`);
    } catch (err) {
      fail++;
      console.log(`  ERR chunk ${i}: ${err.message.slice(0, 150)}`);
    }

    if (i % 3 === 2) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n  Result: ${ok} OK, ${fail} FAIL`);
  return { ok, fail };
}

async function main() {
  console.log('=== KB Ingestion via MongoDB Direct ===');

  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected');

  const existing = await KnowledgeDoc.countDocuments();
  console.log(`Existing documents: ${existing}`);

  const files = [
    {
      path: 'c:\\Users\\carol\\OneDrive\\Documentos\\Resolve\\Folhas-V5.0-extracted-full.txt',
      category: 'Folha de Pagamento - Manual',
      tags: ['folha', 'pagamento', 'manual', 'procedimentos'],
    },
    {
      path: 'c:\\Users\\carol\\OneDrive\\Documentos\\Resolve\\folha_telas_FINAL_V5_extracted.txt',
      category: 'Folha de Pagamento - Telas',
      tags: ['folha', 'telas', 'campos', 'navegacao'],
    },
  ];

  let totalOk = 0, totalFail = 0;

  for (const f of files) {
    if (!fs.existsSync(f.path)) { console.log(`SKIP: ${f.path}`); continue; }
    const r = await ingestFile(f.path, f.category, f.tags);
    totalOk += r.ok;
    totalFail += r.fail;
  }

  console.log(`\n=== TOTAL: ${totalOk} ingested, ${totalFail} errors ===`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
