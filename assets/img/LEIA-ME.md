# Imagens de fundo

Coloque aqui a foto de fundo dos painéis (ex.: `fundo-conlog.jpg`) e aponte
para ela em `assets/fundo.css`, na linha marcada:

```css
--gem-foto: url('/gestao-em-movimento/assets/img/fundo-conlog.jpg');
```

O caminho começa com `/gestao-em-movimento/` de propósito: o CSS é o mesmo
para páginas em profundidades diferentes (`/gerot/`, `/combustivel/seara/arvore/`),
então URL relativa quebraria em parte delas.

Enquanto não houver foto, o `--gem-foto` traz um desenho em gradiente
(parede escura + brilho laranja) só para o mecanismo ficar visível.

Peso: manter abaixo de ~400 KB (JPG qualidade 70–80, largura ~2000 px).
A imagem entra com um escurecedor por cima (`--gem-scrim`), então detalhe
fino se perde — vale mais a composição do que a nitidez.
