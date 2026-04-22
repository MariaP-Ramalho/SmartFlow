const fs = require('fs');
const https = require('https');
const http = require('http');

const API_BASE = process.env.API_URL || 'https://api-resolve.makernocode.dev';
const TOKEN = process.env.AUTH_TOKEN || '';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const mod = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);

    const req = mod.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function splitBySections(text, sectionRegex, maxChunkSize = 3000) {
  const sections = [];
  const parts = text.split(sectionRegex);

  let currentTitle = 'Introdução';
  let currentContent = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.length < 200 && /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ0-9\s.\-–:()\/]+$/i.test(trimmed.split('\n')[0])) {
      if (currentContent.trim()) {
        sections.push({ title: currentTitle, content: currentContent.trim() });
      }
      currentTitle = trimmed.split('\n')[0].trim();
      currentContent = trimmed;
    } else {
      currentContent += '\n' + trimmed;
    }
  }
  if (currentContent.trim()) {
    sections.push({ title: currentTitle, content: currentContent.trim() });
  }

  const chunks = [];
  for (const sec of sections) {
    if (sec.content.length <= maxChunkSize) {
      chunks.push(sec);
    } else {
      const paragraphs = sec.content.split(/\n{2,}/);
      let chunk = '';
      let idx = 1;
      for (const p of paragraphs) {
        if (chunk.length + p.length > maxChunkSize && chunk.length > 0) {
          chunks.push({ title: `${sec.title} (parte ${idx})`, content: chunk.trim() });
          chunk = '';
          idx++;
        }
        chunk += p + '\n\n';
      }
      if (chunk.trim()) {
        chunks.push({ title: `${sec.title} (parte ${idx > 1 ? idx : ''})`.replace(/ \(\)/, ''), content: chunk.trim() });
      }
    }
  }

  return chunks;
}

async function ingestFile(filePath, category, source, tags) {
  console.log(`\nProcessing: ${filePath}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  console.log(`  File size: ${(text.length / 1024).toFixed(1)} KB`);

  const chunks = splitBySections(text, /\n(?=\d+\.\s|#{1,3}\s|SEÇÃO|CAPÍTULO|DOCUMENTO|SUMÁRIO)/i, 3000);
  console.log(`  Chunks: ${chunks.length}`);

  let ingested = 0;
  let errors = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const doc = {
      title: `[${category}] ${chunk.title}`.slice(0, 200),
      content: chunk.content.slice(0, 8000),
      category,
      source,
      tags,
      metadata: { file: filePath.split(/[/\\]/).pop(), chunkIndex: i },
    };

    try {
      const res = await makeRequest('POST', '/knowledge', doc);
      if (res.status >= 200 && res.status < 300) {
        ingested++;
        process.stdout.write(`  [${ingested}/${chunks.length}] ${chunk.title.slice(0, 60)}\r`);
      } else {
        errors++;
        console.log(`  ERROR ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
      }
    } catch (err) {
      errors++;
      console.log(`  NETWORK ERROR: ${err.message}`);
    }

    if (i % 5 === 4) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n  Done: ${ingested} ingested, ${errors} errors`);
  return { ingested, errors };
}

async function main() {
  console.log('=== Knowledge Base Ingestion ===');
  console.log(`API: ${API_BASE}`);

  const files = [
    {
      path: 'c:\\Users\\carol\\OneDrive\\Documentos\\Resolve\\Folhas-V5.0-extracted-full.txt',
      category: 'Folha de Pagamento - Manual',
      source: 'manual',
      tags: ['folha', 'pagamento', 'manual', 'procedimentos'],
    },
    {
      path: 'c:\\Users\\carol\\OneDrive\\Documentos\\Resolve\\folha_telas_FINAL_V5_extracted.txt',
      category: 'Folha de Pagamento - Telas',
      source: 'manual',
      tags: ['folha', 'telas', 'campos', 'navegacao', 'interface'],
    },
  ];

  let totalIngested = 0;
  let totalErrors = 0;

  for (const f of files) {
    if (!fs.existsSync(f.path)) {
      console.log(`SKIP: ${f.path} not found`);
      continue;
    }
    const result = await ingestFile(f.path, f.category, f.source, f.tags);
    totalIngested += result.ingested;
    totalErrors += result.errors;
  }

  console.log(`\n=== TOTAL: ${totalIngested} ingested, ${totalErrors} errors ===`);
}

main().catch(console.error);
