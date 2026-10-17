import type { Metadata } from "next"
import Link from "next/link"
import { DocumentoLegal, Dado } from "@/components/documento-legal"
import { EMPRESA } from "@/lib/empresa"

export const metadata: Metadata = { title: "Termos de Uso" }

export default function Termos() {
  return (
    <DocumentoLegal titulo="Termos de Uso">
      <p>
        Estes Termos regem o uso do {EMPRESA.marca}, sistema de fichas técnicas, custos, CMV, compras e estoque para bares
        e restaurantes, oferecido por <Dado v={EMPRESA.razaoSocial} />, CNPJ <Dado v={EMPRESA.cnpj} /> (&quot;{EMPRESA.marca}&quot;).
        Ao acessar o sistema, você declara que leu e concorda com estes Termos e com a{" "}
        <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
      </p>

      <section className="grid gap-2">
        <h2>1. Quem é quem</h2>
        <ul>
          <li><b>Cliente:</b> a empresa que contrata o {EMPRESA.marca} para as suas casas (bares, restaurantes e similares).</li>
          <li><b>Usuário:</b> a pessoa com login dado pelo Cliente (proprietário, gerência, estoque, contagem ou produção).</li>
          <li><b>Casa:</b> cada estabelecimento do Cliente cadastrado no sistema.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>2. Acesso e responsabilidade pelo login</h2>
        <ul>
          <li>Os logins são pessoais e intransferíveis. O Usuário guarda a própria senha e avisa o administrador do Cliente se suspeitar de uso indevido.</li>
          <li>O Cliente define quem acessa cada casa e com qual nível, e retira o acesso de quem sai da equipe.</li>
          <li>Ações no sistema ficam registradas com o Usuário, a data e a hora (ex.: contagens, pedidos emitidos, aprovações de preço).</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>3. Dados do Cliente</h2>
        <ul>
          <li>Fichas técnicas, cardápios, preços, notas fiscais, fornecedores, contagens e demais informações inseridas <b>pertencem ao Cliente</b>.</li>
          <li>O {EMPRESA.marca} usa esses dados só para prestar o serviço ao próprio Cliente e não os vende nem compartilha com outros clientes.</li>
          <li>O Cliente é responsável pela exatidão do que insere ou importa (por exemplo, notas fiscais e conversões de unidade) e por ter o direito de usar essas informações.</li>
          <li>Ao fim do contrato, o Cliente pode pedir a exportação dos seus dados em até 30 dias. Depois desse prazo, os dados podem ser apagados, salvo guarda exigida por lei.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>4. Natureza das informações</h2>
        <p>
          Custos, CMV, preços sugeridos, alertas, oportunidades de economia e pedidos de compra são <b>apoio à decisão</b>,
          calculados a partir dos dados inseridos. Não substituem a análise do Cliente nem a orientação contábil, fiscal ou
          jurídica. Decisões de preço, compra e estoque são do Cliente.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>5. Disponibilidade e suporte</h2>
        <ul>
          <li>O {EMPRESA.marca} busca manter o sistema disponível e seguro, mas pode haver interrupções para manutenção ou por falhas de terceiros (hospedagem, internet).</li>
          <li>Melhorias e mudanças de funcionalidade podem acontecer a qualquer tempo, preservando os dados do Cliente.</li>
          <li>Suporte pelo e-mail <Dado v={EMPRESA.email} />.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2>6. Uso permitido</h2>
        <p>
          É proibido tentar acessar dados de outras casas ou de outros clientes, contornar as permissões do sistema, copiar
          ou revender o software, ou usá-lo para fins ilícitos. O descumprimento permite suspender o acesso.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>7. Contratação e pagamento</h2>
        <p>
          Planos, valores, implantação e forma de pagamento seguem a proposta comercial aceita pelo Cliente. A falta de
          pagamento pode levar à suspensão do acesso, sem perda dos dados durante o prazo do item 3.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>8. Limitação de responsabilidade</h2>
        <p>
          O {EMPRESA.marca} não responde por perdas causadas por dados incorretos inseridos pelo Cliente, por uso indevido de
          logins, nem por decisões tomadas com base nas informações do sistema. A responsabilidade total do {EMPRESA.marca}, em
          qualquer caso, fica limitada ao valor pago pelo Cliente nos 12 meses anteriores ao fato.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>9. Confidencialidade e propriedade intelectual</h2>
        <p>
          As partes mantêm em sigilo as informações uma da outra. O software, a marca e os métodos do {EMPRESA.marca} são de
          propriedade de <Dado v={EMPRESA.razaoSocial} />; o Cliente recebe o direito de uso enquanto o contrato estiver ativo.
        </p>
      </section>

      <section className="grid gap-2">
        <h2>10. Alterações e foro</h2>
        <p>
          Estes Termos podem ser atualizados. A nova versão será pedida para aceite no próximo acesso. Fica eleito o foro de{" "}
          <Dado v={EMPRESA.foro} /> para resolver questões sobre estes Termos.
        </p>
      </section>
    </DocumentoLegal>
  )
}
