"""
erros.py — Exceções compartilhadas pelas etapas (substitui st.error/st.stop).

No Streamlit, um erro de IA (JSON inválido, etc.) era tratado assim:
    st.error("mensagem")
    st.stop()
Isso mostrava o erro na tela e interrompia a execução do script ali mesmo.

Numa API não existe "parar o script" — o que existe é "levantar uma
exceção e deixar a camada de rotas decidir o status HTTP e o corpo da
resposta de erro". Esta classe é esse substituto direto: todo lugar que
antes tinha st.error(...) + st.stop() agora levanta ErroEtapa(...).
"""


class ErroEtapa(RuntimeError):
    """
    Erro de processamento de uma etapa (ex.: resposta da IA não pôde ser
    interpretada como JSON válido mesmo após tentativa de correção).

    A camada de rotas (main.py) captura isso e devolve HTTP 502 (erro de
    um serviço upstream — no caso, a IA) com a mensagem como detalhe.
    """
    def __init__(self, mensagem: str, resposta_bruta: str | None = None):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.resposta_bruta = resposta_bruta
