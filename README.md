# Media Deck

A free, static media library and full-screen presenter, hosted on GitHub Pages.

## One-time setup
1. Create a GitHub repository and upload everything in this folder (keep the structure, including the hidden `.github` folder).
2. **Settings → Pages**: source = *Deploy from a branch*, branch = `main`, folder = `/ (root)`.
3. **Settings → Actions → General → Workflow permissions**: choose *Read and write permissions* and save.
4. Open `https://<your-username>.github.io/<repo-name>/`.

## Adding media (day to day)
1. In the repo, open the `media` folder.
2. **Add file → Upload files**, drag in images, videos or PDFs, then **Commit changes**.
3. Wait about a minute: the Action updates `manifest.json`, Pages republishes, and the items appear.

Remove or rename files by opening them on GitHub and using the delete / rename options.

- **Groups:** sub-folders inside `media` become groups (filter dropdown + headings).
- **Titles:** add `name.ext.txt` next to a file; its first line becomes the title.
- **Limits:** browser uploads max 25 MB per file. For bigger videos use the Git desktop app (100 MB limit), or host elsewhere.
- GitHub Pages on a free plan is public: do not upload confidential material.

## Using it
- Click cards to select, then reorder in the tray (**Order**: drag or arrows), then **Present**.
- The ▶ on a card presents just that item.
- **Copy link** gives a URL that reopens the same selection and starts presenting.
- Presenter keys: ← / → / Space, Home / End, F fullscreen, Esc close. Click the right two thirds of the screen for next, the left third for previous.
- Auto-advance (5–60 s) and Loop are in the bottom bar. PDFs show one page per slide.

## Rename the site
Edit the `<title>` and `<h1>` in `index.html`.
