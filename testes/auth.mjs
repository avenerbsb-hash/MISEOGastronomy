import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { NextRequest } = require('next/server')

function carregar(arquivo, dependencias = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')
  const codigo = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(codigo, {
    exports, URL, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test' } },
    require: (nome) => dependencias[nome] ?? require(nome),
  }, { filename: arquivo })
  return exports
}

const { destinoLogin } = carregar('lib/destino-login.ts')
test('destino de login aceita caminhos locais e recusa redirecionamentos externos', () => {
  assert.equal(destinoLogin('/fichas?busca=massa'), '/fichas?busca=massa')
  for (const valor of ['https://example.com', '//example.com', '/\\example.com', '/\n/example.com', '/login', '/login/reset', null, ['/fichas']]) {
    assert.equal(destinoLogin(valor), '/', String(valor))
  }
})

function executar(rota, user, renovar = false) {
  const { middleware } = carregar('middleware.ts', {
    '@supabase/ssr': {
      createServerClient: (_url, _key, { cookies }) => ({ auth: {
        getUser: async () => {
          if (renovar) cookies.setAll([{ name: 'sessao-teste', value: user ? 'renovada' : '', options: { path: '/', httpOnly: true, maxAge: user ? 3600 : 0 } }])
          return { data: { user } }
        },
      } }),
    },
  })
  return middleware(new NextRequest('https://app.example' + rota))
}

test('visitante vai para login com o destino original', async () => {
  const r = await executar('/fichas?busca=massa', null)
  const url = new URL(r.headers.get('location'))
  assert.equal(r.status, 307)
  assert.equal(url.pathname, '/login')
  assert.equal(url.searchParams.get('next'), '/fichas?busca=massa')
})
test('somente login e documentos legais ficam públicos', async () => {
  for (const rota of ['/login', '/termos', '/privacidade']) assert.equal((await executar(rota, null)).status, 200)
  for (const rota of ['/login-interno', '/login/admin', '/usuarios', '/cmv']) assert.equal((await executar(rota, null)).status, 307)
})
test('sessão válida permite a página protegida', async () => {
  assert.equal((await executar('/fichas', { id: 'usuario' })).status, 200)
})
test('renovação de cookies sobrevive ao redirecionamento de login', async () => {
  const r = await executar('/login', { id: 'usuario' }, true)
  assert.equal(new URL(r.headers.get('location')).pathname, '/')
  assert.equal(r.cookies.get('sessao-teste').value, 'renovada')
  assert.equal(r.cookies.get('sessao-teste').httpOnly, true)
  assert.match(r.headers.get('cache-control'), /no-store/)
})
test('sessão inválida limpa cookies também no redirecionamento', async () => {
  const r = await executar('/usuarios', null, true)
  assert.equal(r.cookies.get('sessao-teste').maxAge, 0)
  assert.equal(r.status, 307)
})
test('resposta autenticada não pode ser armazenada em cache compartilhado', async () => {
  const r = await executar('/fichas', { id: 'usuario' }, true)
  assert.equal(r.cookies.get('sessao-teste').value, 'renovada')
  assert.match(r.headers.get('cache-control'), /private, no-store/)
})
