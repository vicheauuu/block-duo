# Block Duo — Co-op multiplayer

Un prototip web multiplayer inspirat de jocurile puzzle cu blocuri. Doi jucători împart aceeași tablă 8×8, folosesc același set de 3 piese și construiesc un scor comun.

## Cerințe
- Node.js 20+ recomandat
- npm

## Pornire locală
1. Dezarhivează proiectul.
2. Deschide terminalul în folderul `block-duo-coop`.
3. Rulează:
   ```bash
   npm install
   npm run dev
   ```
4. Deschide `http://localhost:5173`.
5. Pentru test local, deschide pagina și într-o fereastră Incognito sau într-un alt browser. Creează o cameră și intră cu codul în a doua fereastră.

Serverul Socket.IO pornește pe `http://localhost:3001`.

## Cum se joacă
- Un jucător creează o cameră și trimite linkul sau codul.
- Al doilea jucător intră în cameră.
- Selectați o piesă din setul comun, apoi atingeți celula din stânga-sus unde vreți s-o plasați.
- După folosirea tuturor celor 3 piese apare un set nou.
- Rândurile și coloanele completate dispar; scorul este comun.

## Publicare
Frontend-ul și backend-ul trebuie să fie accesibile prin internet. O variantă simplă este:
1. Publică proiectul pe GitHub.
2. Deploy pe un host Node.js care acceptă WebSockets (de exemplu Render).
3. Setează variabila `NODE_ENV=production` și portul `PORT` oferit de platformă.
4. Construiește frontend-ul cu `npm run build`.
5. Pentru un deploy separat al frontend-ului, setează `VITE_SERVER_URL` la URL-ul HTTPS al serverului Socket.IO înainte de build și publică folderul `dist` pe un host static.

Notă: în acest starter, frontend-ul și serverul sunt gândite să poată fi servite împreună în producție. Pe un singur serviciu Node, build-ul (`npm run build`) trebuie executat înainte de pornirea cu `NODE_ENV=production npm start`.

## Limitări ale prototipului
- Camerele și scorurile sunt ținute în memoria serverului; se pierd dacă serverul repornește.
- Nu există conturi, chat, reconectare persistentă sau protecție anti-cheat avansată.
- Jocul este un prototip funcțional, nu o clonă exactă a unui joc comercial.
