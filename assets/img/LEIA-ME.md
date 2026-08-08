# Imagens de fundo

`fundo-conlog.jpg` é o fundo do modo escuro de todos os painéis, apontado
por `--gem-foto` em `assets/fundo.css`:

```css
--gem-foto: url('img/fundo-conlog.jpg');
```

O caminho é relativo a `assets/fundo.css`, não à página que o inclui — por
isso o mesmo CSS serve `/gerot/` e `/combustivel/seara/arvore/`.

Para trocar: substitua o arquivo (ou aponte a variável para outro nome).
Manter abaixo de ~400 KB (JPG qualidade 80–85, largura ~1600–2000 px).
A imagem entra com um escurecedor por cima (`--gem-scrim`), então detalhe
fino se perde — vale mais a composição do que a nitidez.
