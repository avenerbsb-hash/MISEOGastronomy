import type { Metadata } from "next"
import { DocumentoLegal, Dado } from "@/components/documento-legal"
import { EMPRESA } from "@/lib/empresa"

export const metadata: Metadata = { title: "Política de Privacidade" }

export default function Privacidade() {
  return (
    <DocumentoLegal titulo="Política de Privacidade">
      <p>
        Esta Política explica como o {EMPRESA.marca} (<Dado v={EMPRESA.razaoSocial} />, CNPJ <Dado v={EMPRESA.cnpj} />) trata
        dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
      </p>

      <section className="grid gap-2">
        <h2>1. Papéis de cada um</h2>
        <ul>
          <li><b>Dados de uso do sistema</b> (nome, e-mail e acessos dos Usuários): o {EMPRESA.marca} é o <b>controlador</b>.</li>
          <li><b>Dados do negócio do Cliente</b> (notas, fornecedores, equipe, contagens): o Cliente é o <b>controlador</b> e o {EMPRESA.marca} é o <b>operador</b>, que trata os dados só para prestar o serviço, conforme as instruções do Cliente.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>2. Quais dados tratamos</h2>
        <ul>
          <li><b>Cadastro do Usuário:</b> nome, e-mail, senha (guardada de forma cifrada pelo serviço de autenticação), casas e nível de acesso.</li>
          <li><b>Registros de uso:</b> quem fez cada ação e quando (contagens, pedidos, aprovações, alterações), para segurança e auditoria.</li>
          <li><b>Dados de notas fiscais:</b> fornecedores (em geral empresas, com CNPJ), produtos, quantidades e valores. Podem aparecer nomes de pessoas quando o emitente é pessoa física.</li>
          <li><b>Cookies:</b> apenas os essenciais, para manter o login e lembrar a casa escolhida. Não usamos cookies de publicidade.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>3. Para que e com qual base legal</h2>
        <ul>
          <li>Prestar o serviço contratado: login, permissões, cálculos e relatórios (execução de contrato).</li>
          <li>Segurança, prevenção de fraude e registro de quem fez cada ação (legítimo interesse).</li>
          <li>Cumprir obrigações legais e responder a autoridades (obrigação legal).</li>
        </ul>
        <p>Não vendemos dados pessoais e não os usamos para publicidade.</p>
      </section>

      <section className="grid gap-2">
        <h2>4. Com quem compartilhamos</h2>
        <ul>
          <li><b>Supabase</b> — banco de dados e autenticação.</li>
          <li><b>Vercel</b> — hospedagem do sistema.</li>
        </ul>
        <p>
          Esses fornecedores podem manter servidores fora do Brasil. A transferência internacional segue a LGPD (art. 33),
          com cláusulas contratuais e medidas de segurança dos próprios fornecedores.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>5. Segurança</h2>
        <ul>
          <li>Conexão cifrada (HTTPS) em todo o acesso.</li>
          <li>Cada Usuário só vê as casas e as informações liberadas para o seu nível. Por exemplo, quem cuida da produção ou da contagem não vê valores em R$. A regra é aplicada no próprio banco de dados.</li>
          <li>Históricos de preço e de produção não são apagados nem alterados; correções ficam registradas.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>6. Por quanto tempo guardamos</h2>
        <p>
          Enquanto o contrato do Cliente estiver ativo. Depois, por até 30 dias para exportação, e pelo prazo que a lei exigir
          para registros específicos. Usuários desativados deixam de acessar, mas o nome continua nos registros de ações já feitas.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>7. Seus direitos</h2>
        <p>
          Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade ou eliminação dos seus dados,
          informação sobre compartilhamentos e revisão de consentimentos (art. 18 da LGPD). Peça pelo e-mail{" "}
          <Dado v={EMPRESA.email} />. Pedidos sobre dados do negócio de um Cliente são encaminhados a ele, que é o controlador.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>8. Contato do encarregado (DPO)</h2>
        <p>Dúvidas sobre privacidade: <Dado v={EMPRESA.email} />.</p>
      </section>

      <section className="grid gap-2">
        <h2>9. Alterações</h2>
        <p>Esta Política pode ser atualizada. A nova versão será pedida para aceite no próximo acesso ao sistema.</p>
      </section>
    </DocumentoLegal>
  )
}
