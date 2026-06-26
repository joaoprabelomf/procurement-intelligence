"""
correcao_generica.py — Chat conversacional genérico para qualquer etapa (2-8).

A Etapa 1 já tinha seu próprio mecanismo de chat inteligente
(processar_mensagem_etapa1): decide a intenção da mensagem do usuário
(edição, pergunta, confirmação) e age de acordo, em vez de assumir
sempre que é uma correção.

Este módulo generaliza o MESMO padrão para qualquer etapa (2-8), que antes
só tinham uma função simplista de "tentar reescrever o JSON" sem decidir
intenção, sem responder perguntas, e sem pedir esclarecimento quando o
pedido era ambíguo.

Diferente da Etapa 1, que tem um schema de estado fixo (cliente,
documentos, proponentes...), as etapas 2-8 têm schemas de resultado
diferentes entre si. Por isso o prompt aqui é mais genérico: instrui o
Claude a manter EXATAMENTE as mesmas chaves do JSON original ao editar,
sem assumir uma estrutura fixa de antemão.
"""

import json

from .ia import call_claude
from .erros import ErroEtapa

# Mapeia o número da etapa para o atributo do Estudo onde o resultado
# daquela etapa fica gravado.
_ATRIBUTO_POR_ETAPA = {
    2: "baseline",
    3: "edital",
    4: "propostas_tecnicas",
    5: "comparacao_tecnica",
    6: "equalizacao_comercial",
    7: "recomendacoes",
    8: "estrategia_categoria",
}

# Nomes amigáveis de cada etapa, usados no prompt para dar contexto ao Claude.
_NOME_POR_ETAPA = {
    2: "Cenário Atual (Baseline)",
    3: "Edital Técnico",
    4: "Propostas Técnicas",
    5: "Comparação Técnica",
    6: "Equalização Comercial",
    7: "Recomendações Finais",
    8: "Estratégia da Categoria (Matriz de Kraljic)",
}


def _parse_resposta(resposta_bruta: str) -> dict:
    texto = resposta_bruta.strip()
    if texto.startswith("```"):
        linhas = texto.split("\n")
        texto = "\n".join(linhas[1:])
        if texto.rstrip().endswith("```"):
            texto = texto.rstrip()[:-3]
        texto = texto.strip()
    inicio = texto.find("{")
    if inicio > 0:
        texto = texto[inicio:]
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        texto_cortado = texto.rstrip().rstrip(",")
        abertas = texto_cortado.count("{") - texto_cortado.count("}")
        colchetes = texto_cortado.count("[") - texto_cortado.count("]")
        fechamento = "]" * colchetes + "}" * abertas
        try:
            return json.loads(texto_cortado + fechamento)
        except json.JSONDecodeError:
            raise ValueError("JSON inválido mesmo após tentativa de correção.")


def processar_mensagem_generica(estudo, numero_etapa: int, mensagem: str) -> dict:
    """
    Chat conversacional genérico para qualquer etapa de 2 a 8 — mesmo
    princípio de processar_mensagem_etapa1, mas sem assumir um schema fixo.

    Decide a intenção da mensagem do usuário e age de acordo:
      - "edicao": aplica a correção, devolve o resultado atualizado.
      - "pergunta": responde sem alterar nada.
      - "confirmacao": confirma sem alterar nada.
      - "esclarecimento": o pedido é ambíguo demais para agir com segurança;
        devolve uma pergunta de volta ao usuário, sem alterar nada.

    Retorna: {"tipo": str, "mensagem": str, "resultado": dict | None}
    O campo "resultado" só vem preenchido quando tipo == "edicao".
    """
    atributo = _ATRIBUTO_POR_ETAPA.get(numero_etapa)
    if atributo is None:
        raise ValueError(f"Chat genérico não suportado para a etapa {numero_etapa}.")

    estado_atual = getattr(estudo, atributo)
    if estado_atual is None:
        raise ErroEtapa(f"A etapa {numero_etapa} ainda não tem resultado para conversar sobre.")

    nome_etapa = _NOME_POR_ETAPA.get(numero_etapa, f"Etapa {numero_etapa}")
    estado_atual_json = json.dumps(estado_atual, ensure_ascii=False, indent=2)

    system = f"""
Você é um consultor sênior de procurement conversando com o usuário sobre o
resultado da etapa "{nome_etapa}" de uma análise de compras. Fale como um
colega objetivo, em português do Brasil, sem floreio.

Você recebe o RESULTADO ATUAL desta etapa (JSON) e uma MENSAGEM livre do
usuário. Decida a intenção da mensagem e aja:

1) Se o usuário pede uma MUDANÇA clara e específica no resultado (corrigir um
   valor, ajustar uma classificação, mudar um texto, adicionar/remover um
   item de uma lista) → tipo = "edicao". Aplique a mudança e devolva o JSON
   COMPLETO atualizado em "resultado", MANTENDO EXATAMENTE as mesmas chaves
   do JSON original — não invente chaves novas, não remova chaves que não
   foram mencionadas. Em "mensagem", explique em 1 frase curta o que mudou.

2) Se o usuário faz uma PERGUNTA ou comentário sem pedir mudança (ex.: "por
   que esse fornecedor ficou com esse status?", "o que significa isso?") →
   tipo = "pergunta". Responda de forma direta e específica, usando os dados
   do JSON atual, em "mensagem". NÃO inclua "resultado".

3) Se o usuário está APROVANDO/CONFIRMANDO (ex.: "pode seguir", "tá certo",
   "confirmo", "perfeito", "ok") → tipo = "confirmacao". Em "mensagem", dê um
   OK curto. NÃO inclua "resultado".

4) Se o pedido for AMBÍGUO ou genérico demais para você aplicar com segurança
   (ex.: "melhora isso", "ajusta aí", ou pede uma mudança mas não deixa claro
   qual valor/item exatamente) → tipo = "esclarecimento". Em "mensagem",
   pergunte especificamente o que falta saber para agir (ex.: "Qual fornecedor
   você quer que eu ajuste, e para qual valor?"). NÃO inclua "resultado", e
   NÃO tente adivinhar.

Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois:
{{
  "tipo": "edicao" | "pergunta" | "confirmacao" | "esclarecimento",
  "mensagem": "<texto natural e curto>",
  "resultado": {{...}}
}}
O campo "resultado" só aparece quando tipo == "edicao".

LIMITE: o JSON de resposta completo deve caber em 6000 tokens — se o
resultado original for muito grande, mantenha a edição pontual e não
reescreva partes que não foram mencionadas na mensagem do usuário.
"""
    mensagem_user = f"RESULTADO ATUAL ({nome_etapa}):\n{estado_atual_json}\n\nMENSAGEM DO USUÁRIO:\n{mensagem}"

    resposta_bruta = call_claude(
        messages=[{"role": "user", "content": mensagem_user}],
        system=system,
        max_tokens=6000,
    )

    try:
        dados = _parse_resposta(resposta_bruta)
    except (json.JSONDecodeError, ValueError) as e:
        raise ErroEtapa(
            f"Não consegui interpretar a resposta ao processar sua mensagem na Etapa {numero_etapa}: {e}",
            resposta_bruta=resposta_bruta,
        )

    tipo = dados.get("tipo", "pergunta")
    msg_natural = dados.get("mensagem", "")

    if tipo == "edicao" and isinstance(dados.get("resultado"), dict):
        novo_resultado = dados["resultado"]
        setattr(estudo, atributo, novo_resultado)
        estudo.add_premissa(f"[Etapa {numero_etapa}] Correção via chat: {mensagem}")
        return {"tipo": "edicao", "mensagem": msg_natural, "resultado": novo_resultado}

    if tipo == "confirmacao":
        return {"tipo": "confirmacao", "mensagem": msg_natural or "Confirmado.", "resultado": None}

    if tipo == "esclarecimento":
        return {"tipo": "esclarecimento", "mensagem": msg_natural, "resultado": None}

    # pergunta (ou qualquer coisa que não seja edição/confirmação/esclarecimento)
    return {"tipo": "pergunta", "mensagem": msg_natural, "resultado": None}
