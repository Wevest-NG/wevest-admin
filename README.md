# Wevest Admin

The staff dashboard for the Wevest backend. React + Vite + TypeScript. It is its own project and talks to the API only over HTTP (`/v1/staff/*`, `/v1/admin/*`).

```
npm install
npm run dev        # http://localhost:5173/admin/   (proxies /v1 to the API; default http://localhost:3005, override with WEVEST_API=http://localhost:3000)
npm run build      # -> dist/
npm test           # vitest + Testing Library + axe
npm run lint       # eslint incl. jsx-a11y
npm run typecheck
```

## First sign-in

In the backend repo, create a Super Admin:

```
dotnet run --project src/Wevest.Api -- staff-create you@wevest.app "Your Name"
```

Sign in with the temporary password it prints, choose your own password, and set up an authenticator app. Save the recovery codes. Because every sensitive action needs a second person, create a second staff account too (Staff → Invite staff, approved by another Super Admin).

## Same origin

The refresh token is an HttpOnly, SameSite=Strict cookie, so the dashboard and the API must be on one origin. The API does not enable CORS on purpose.

- **Development:** the Vite dev server proxies `/v1` to the API, so it just works.
- **Production:** serve `dist/` and the API behind one reverse proxy, for example (nginx):

```nginx
location /admin/ { alias /srv/wevest-admin/dist/; try_files $uri $uri/ /admin/index.html; add_header Cache-Control "no-store" ; }
location /admin/assets/ { alias /srv/wevest-admin/dist/assets/; add_header Cache-Control "public, max-age=31536000, immutable"; }
location /v1/ { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $remote_addr; }

# send these on /admin/ responses:
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
```

Everything is bundled (fonts included), so the CSP needs nothing external.

## How it is built

- **Auth.** Password, then an authenticator code (or a one-time recovery code). The access token lives in memory only. A 401 triggers one shared silent refresh. Sessions end after 30 minutes idle (with a warning) and 8 hours absolute; the server enforces both. A rate-limited or unreachable server is never mistaken for being signed out.
- **Permissions.** Roles are data. Navigation, pages and buttons follow the signed-in role (`src/auth/Can.tsx`), but the server is the authority and checks every call.
- **Two-person approval.** Sensitive actions answer `202`; the UI says so plainly and the request appears under **Approvals**, where a different person sees exactly what will run.
- **Accessibility.** Landmarks and a skip link, labelled controls, keyboard-operable native dialogs, no colour-only status, WCAG AA contrast in light and dark, reduced-motion support. Every page was checked with axe-core in a real browser (light and dark); `npm test` runs axe on the key screens.
- **Components, not browser widgets.** Dates are the custom calendar (`src/ui/DatePicker.tsx`: `DateField` for a day, `DateTimeField` for a day and time; values are `YYYY-MM-DD` and `YYYY-MM-DDTHH:mm`, with `min` / `max` limits and a fully keyboard-driven grid). Dropdowns are the custom `Select` (`src/ui/Select.tsx`; `SelectField` takes `<option>` children like a native select), notifications are `useToast()` alerts (title, dismiss button, pause on hover), and confirmations are `await useConfirm()({ ... })`. Do not use `<select>`, `<input type="date">`, `alert()`, `confirm()` or `prompt()`. The dropdown follows the ARIA select-only combobox pattern (arrows, Home/End, type-ahead, Esc), opens inside a surrounding dialog so it is never hidden, and flips upward near the bottom of the screen.
- **Design.** Tokens are in `src/styles/tokens.css`, read from the Wevest mobile app Figma file (primary purple scale, neutrals, success / error / info); the rest of each scale is interpolated and marked as derived. The design-system file could not be read (it was not shared with the connected Figma account), so replace the tokens with its values when available.
