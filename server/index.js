import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { randomInt } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rooms = new Map();
const SIZE = 8;

const SHAPES = [
  [[0,0]], [[0,0],[0,1]], [[0,0],[1,0]], [[0,0],[0,1],[0,2]],
  [[0,0],[1,0],[2,0]], [[0,0],[0,1],[1,0],[1,1]],
  [[0,0],[0,1],[0,2],[1,0]], [[0,0],[1,0],[2,0],[2,1]],
  [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[0,1],[0,2],[1,1]], [[0,1],[1,0],[1,1],[1,2]],
  [[0,0],[1,0],[1,1],[2,1]], [[0,1],[1,0],[1,1],[2,0]],
  [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
  [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]
];
const COLORS = ['blue', 'yellow', 'green', 'purple', 'orange', 'red', 'cyan'];

function makePiece() {
  const shape = SHAPES[randomInt(SHAPES.length)].map(([x,y]) => [x,y]);
  const maxX = Math.max(...shape.map(([x]) => x));
  const maxY = Math.max(...shape.map(([,y]) => y));
  return { shape, color: COLORS[randomInt(COLORS.length)], w: maxX + 1, h: maxY + 1, id: cryptoRandomId() };
}
function cryptoRandomId() { return Math.random().toString(36).slice(2, 10); }
function newPieces() { return [makePiece(), makePiece(), makePiece()]; }
function newRoom(code, hostId) {
  return { code, players: new Map(), board: Array.from({length: SIZE}, () => Array(SIZE).fill(null)),
    pieces: newPieces(), used: [false,false,false], score: 0, hostId, status: 'waiting', lastAction: null };
}
function publicState(room) {
  return { code: room.code, players: [...room.players.values()].map(p => ({id:p.id, name:p.name})),
    board: room.board, pieces: room.pieces, used: room.used, score: room.score, status: room.status,
    lastAction: room.lastAction };
}
function broadcast(room) { io.to(room.code).emit('state', publicState(room)); }
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i=0;i<5;i++) code += chars[randomInt(chars.length)];
  return code;
}
function canPlace(board, piece, row, col) {
  return piece.shape.every(([dx,dy]) => {
    const r = row + dy, c = col + dx;
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === null;
  });
}
function placePiece(room, pieceIndex, row, col, playerName) {
  const piece = room.pieces[pieceIndex];
  if (!piece || room.used[pieceIndex] || !canPlace(room.board, piece, row, col)) return false;
  for (const [dx,dy] of piece.shape) room.board[row+dy][col+dx] = piece.color;
  room.used[pieceIndex] = true;
  room.lastAction = `${playerName} a plasat o piesă`;
  let cleared = new Set();
  for (let r=0;r<SIZE;r++) if (room.board[r].every(cell => cell !== null)) cleared.add(`r${r}`);
  for (let c=0;c<SIZE;c++) if (room.board.every(row => row[c] !== null)) cleared.add(`c${c}`);
  for (const key of cleared) {
    if (key[0] === 'r') room.board[Number(key.slice(1))] = Array(SIZE).fill(null);
    else { const c = Number(key.slice(1)); for (let r=0;r<SIZE;r++) room.board[r][c] = null; }
  }
  const cells = piece.shape.length;
  room.score += cells + cleared.size * 10;
  if (cleared.size) room.lastAction = `${playerName} a completat ${cleared.size} linie/coloană!`;
  if (room.used.every(Boolean)) { room.pieces = newPieces(); room.used = [false,false,false]; }
  return true;
}

io.on('connection', socket => {
  socket.on('createRoom', ({name}, cb) => {
    let code; do { code = randomCode(); } while (rooms.has(code));
    const room = newRoom(code, socket.id);
    room.players.set(socket.id, {id:socket.id, name:(name || 'Jucător').slice(0,18)});
    rooms.set(code, room);
    socket.join(code);
    cb?.({ok:true, code, state:publicState(room), playerId:socket.id});
    broadcast(room);
  });
  socket.on('joinRoom', ({code, name}, cb) => {
    code = String(code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ok:false, error:'Camera nu există. Verifică codul.'});
    if (room.players.size >= 2 && !room.players.has(socket.id)) return cb?.({ok:false, error:'Camera este plină (maximum 2 jucători).'});
    room.players.set(socket.id, {id:socket.id, name:(name || 'Jucător').slice(0,18)});
    if (room.players.size === 2) room.status = 'playing';
    socket.join(code);
    cb?.({ok:true, code, state:publicState(room), playerId:socket.id});
    broadcast(room);
  });
  socket.on('placePiece', ({code, pieceIndex, row, col}, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || !room.players.has(socket.id)) return cb?.({ok:false, error:'Nu ești în această cameră.'});
    if (room.players.size < 2) return cb?.({ok:false, error:'Așteptăm al doilea jucător.'});
    if (!Number.isInteger(pieceIndex) || !Number.isInteger(row) || !Number.isInteger(col)) return cb?.({ok:false, error:'Mutare invalidă.'});
    const player = room.players.get(socket.id);
    if (!placePiece(room, pieceIndex, row, col, player.name)) return cb?.({ok:false, error:'Piesa nu încape aici.'});
    cb?.({ok:true});
    broadcast(room);
  });
  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        if (room.players.size < 2) room.status = 'waiting';
        if (room.players.size === 0) rooms.delete(code);
        else broadcast(room);
      }
    }
  });
});

app.get('/health', (_req,res) => res.json({ok:true, rooms:rooms.size}));
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist');
  app.use(express.static(dist));
  app.get('*', (_req,res) => res.sendFile(path.join(dist, 'index.html')));
}
server.listen(PORT, () => console.log(`Block Duo server running on port ${PORT}`));
