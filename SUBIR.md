# Cómo subir esto a GitHub

Desde la carpeta `arcanveil/`, con el repositorio ya creado y vacío:

```bash
git init
git add .
git commit -m "ARCANVEIL: motor de rol narrativo web"
git branch -M main
git remote add origin https://github.com/alobatoh/arcanveil.git
git push -u origin main
```

Si el repositorio ya tiene commits (por ejemplo un README creado desde la web):

```bash
git pull --rebase origin main
git push -u origin main
```

## Después

GitHub Pages sirve ARCANVEIL sin configuración adicional, porque no hay
compilación: son archivos estáticos.

En el repositorio → **Settings → Pages → Source: main / (root)**.

En unos minutos estará en `https://alobatoh.github.io/arcanveil/`.
