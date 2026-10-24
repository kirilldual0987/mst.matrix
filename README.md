# mst.matrix

A minimal Matrix web client built with plain JavaScript and **matrix-js-sdk**.

## Features
- Login with homeserver URL, Matrix ID and password.
- List of joined rooms.
- Click a room to view recent messages.
- Send text messages.
- Logout.

The UI uses the lightweight **Milligram** CSS framework for a clean look.

## Deploy to GitHub Pages
1. Create a new repository (e.g. `yourname/mst.matrix`).
2. Copy the `mst.matrix` folder into the repository root.
3. Commit and push.
4. In the repository settings enable **GitHub Pages** → source: `main` branch / `root`.
5. The site will be available at `https://yourname.github.io/mst.matrix/`.

You can also serve the folder locally with any static web server, e.g.:
```bash
npx serve .
```
