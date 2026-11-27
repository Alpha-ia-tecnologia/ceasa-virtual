import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { um } from './db.ts';
import { api } from './api.ts';
import { popular } from './seed/seed.ts';
import { SANDBOX } from './auth.ts';

const PORTA = Number(process.env.PORT) || 3000;
const producao = process.env.NODE_ENV === 'production';

// primeira execução: carrega os dados sintéticos do sandbox [RF-ADM-05]
if (!um('SELECT 1 FROM municipios LIMIT 1')) {
  if (!SANDBOX) console.warn('Banco vazio e sandbox desligado: nenhum dado foi carregado.');
  else {
    const r = popular();
    console.log(`Sandbox carregado em ${r.ms} ms: ${r.pedidos} pedidos, ${r.evidencias} evidências, ${r.trilha} registros na trilha.`);
  }
}

const app = express();
app.disable('x-powered-by');
app.use('/api', api);

if (producao) {
  const dist = path.resolve('dist');
  if (!existsSync(dist)) throw new Error('Pasta dist não encontrada. Rode "npm run build" antes de "npm start".');
  app.use(express.static(dist, { maxAge: '1h' }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORTA, () => {
  console.log(`CEASA VIRTUAL em http://localhost:${PORTA}${SANDBOX ? '  (ambiente de simulação)' : ''}`);
});
