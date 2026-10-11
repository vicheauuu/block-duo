import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);
const socket = io(SERVER_URL, { autoConnect: true });
const N = 8;

function MiniPiece({piece, selected, onClick, disabled, onPointerDown}) {
  const shape = piece?.shape || [];
  const w = piece?.w || 1, h = piece?.h || 1;
  return <button className={`piece-card ${selected ? 'selected' : ''} ${disabled ? 'piece-used' : ''}`}
    onClick={onClick} onPointerDown={onPointerDown} disabled={disabled || !piece}
    aria-label="Selectează piesa și trage-o pe tablă">
    <span className="mini-grid" style={{gridTemplateColumns:`repeat(${w}, 17px)`, gridTemplateRows:`repeat(${h}, 17px)`}}>
      {Array.from({length:w*h}, (_,i) => {
        const x=i%w, y=Math.floor(i/w);
        return <span key={i} className={`mini-cell ${shape.some(([sx,sy])=>sx===x&&sy===y) ? `filled ${piece.color}` : ''}`} />;
      })}
    </span>
    {disabled && <span className="used-mark">✓</span>}
  </button>;
}

function App() {
  const [name,setName] = useState(localStorage.getItem('blockduo-name') || '');
  const [roomCode,setRoomCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [state,setState] = useState(null);
  const [playerId,setPlayerId] = useState('');
  const [selected,setSelected] = useState(0);
  const [notice,setNotice] = useState('');
  const [hoverCell,setHoverCell] = useState(null);
  const [busy,setBusy] = useState(false);
  const [dragging,setDragging] = useState(null);
  const [pointerPos,setPointerPos] = useState({x:0,y:0});
  const [suppressClick,setSuppressClick] = useState(false);

  useEffect(() => {
    const onState = next => { setState(next); setSelected(old => next.used[old] ? Math.max(0, next.used.findIndex(v=>!v)) : old); };
    socket.on('state', onState);
    return () => socket.off('state', onState);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = event => {
      setPointerPos({x:event.clientX,y:event.clientY});
      // On touch screens, use a point above the finger for the board target.
      // This moves the actual block placement preview above the fingertip.
      const hitY = event.pointerType === 'touch' ? event.clientY - 76 : event.clientY;
      const target = document.elementFromPoint(event.clientX, hitY)?.closest('[data-row][data-col]');
      if (!target || !state?.code) return;
      const row = Number(target.dataset.row), col = Number(target.dataset.col);
      if (dragging.row === row && dragging.col === col) return;
      setDragging(old => old ? {...old, row, col} : old);
      socket.emit('previewMove', {code:state.code, pieceIndex:dragging.pieceIndex, row, col});
    };
    const onUp = event => {
      const hitY = event.pointerType === 'touch' ? event.clientY - 76 : event.clientY;
      const target = document.elementFromPoint(event.clientX, hitY)?.closest('[data-row][data-col]');
      if (target && state?.code) {
        const row = Number(target.dataset.row), col = Number(target.dataset.col);
        setSelected(dragging.pieceIndex);
        setSuppressClick(true);
        place(row, col, dragging.pieceIndex);
        window.setTimeout(()=>setSuppressClick(false), 250);
      }
      socket.emit('clearPreview', {code:state?.code});
      setDragging(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, state?.code]);

  const players = state?.players || [];
  const me = players.find(p=>p.id===playerId);
  const partner = players.find(p=>p.id!==playerId);
  const shareUrl = state ? `${location.origin}${location.pathname}?room=${state.code}` : '';
  const currentPiece = state?.pieces?.[selected];
  const validPreview = useMemo(() => {
    if (!state || !currentPiece || !hoverCell) return false;
    return currentPiece.shape.every(([dx,dy]) => {
      const r=hoverCell.row+dy,c=hoverCell.col+dx;
      return r>=0&&r<N&&c>=0&&c<N&&state.board[r][c]===null;
    });
  },[state,currentPiece,hoverCell]);

  function createRoom() {
    localStorage.setItem('blockduo-name', name.trim() || 'Jucător');
    socket.emit('createRoom', {name:name.trim() || 'Jucător'}, result => {
      if (!result?.ok) return setNotice('Nu am putut crea camera.');
      setPlayerId(result.playerId); setState(result.state); setRoomCode(result.code);
      history.replaceState({}, '', `?room=${result.code}`); setNotice('Camera este gata! Trimite linkul prietenei tale.');
    });
  }
  function joinRoom() {
    localStorage.setItem('blockduo-name', name.trim() || 'Jucător');
    socket.emit('joinRoom', {name:name.trim() || 'Jucător', code:roomCode}, result => {
      if (!result?.ok) return setNotice(result?.error || 'Nu am putut intra în cameră.');
      setPlayerId(result.playerId); setState(result.state); setRoomCode(result.code);
      history.replaceState({}, '', `?room=${result.code}`); setNotice('Te-ai conectat la cameră!');
    });
  }
  function place(row,col,pieceIndex=selected) {
    if (!state || state.players.length < 2 || state.status !== 'playing' || state.used[pieceIndex] || !state.pieces[pieceIndex] || busy) return;
    setBusy(true);
    socket.emit('placePiece', {code:state.code, pieceIndex, row, col}, result => {
      setBusy(false);
      if (!result?.ok) setNotice(result?.error || 'Mutarea nu a reușit.');
      else setNotice('');
    });
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setNotice('Link copiat! Trimite-l prietenei tale.'); }
    catch { setNotice(`Codul camerei este ${state.code}. Copiază-l și trimite-l.`); }
  }

  if (!state) return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">▦</div><div><h1>Block Duo</h1><p>Un puzzle, două persoane, o singură echipă.</p></div><span className="pill">CO-OP ONLINE</span></header>
    <section className="welcome-card">
      <div className="welcome-copy"><span className="eyebrow">JUCĂM ÎMPREUNĂ</span><h2>Construiți un scor<br/><em>cât mai mare.</em></h2><p>Plasați piese pe aceeași tablă, completați rânduri și coloane și vedeți cât de departe ajungeți împreună.</p>
        <div className="feature-row"><span>✦ Aceleași piese</span><span>↗ Link de invitație</span><span>♡ Scor comun</span></div></div>
      <div className="preview-board" aria-hidden="true">{Array.from({length:64},(_,i)=><span key={i} className={([0,1,8,17,18,26,27,28,35,43,44,52,53,54,61].includes(i)?`demo-${i%4}`:'')}/>)}</div>
    </section>
    <section className="lobby-card">
      <div><span className="eyebrow">INTRĂ ÎN JOC</span><h2>Creați-vă camera</h2><p>Unul creează camera, celălalt intră cu un link sau cod.</p></div>
      <label className="field-label">Numele tău<input value={name} onChange={e=>setName(e.target.value)} maxLength={18} placeholder="De ex. Alex" /></label>
      <div className="lobby-actions"><button className="primary-btn" onClick={createRoom}>＋ Creează cameră</button><div className="join-box"><input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase().slice(0,5))} placeholder="CODUL CAMEREI" maxLength={5}/><button className="secondary-btn" onClick={joinRoom} disabled={roomCode.trim().length<4}>Intră</button></div></div>
      {notice && <p className="notice">{notice}</p>}
    </section>
    <footer>Făcut pentru doi. Inspirat de puzzle-urile cu blocuri.</footer>
  </main>;

  return <main className="app-shell game-shell">
    <header className="topbar"><div className="brand-mark">▦</div><div><h1>Block Duo</h1><p>Co-op · Scorul vostru comun</p></div><div className="room-pill"><span className={`status-dot ${players.length===2?'online':''}`}/>{players.length===2?'Conectați':'Așteptăm partenerul'}</div></header>
    <section className="game-layout">
      <div className="board-panel">
        <div className="score-header"><div><span className="eyebrow">SCORUL ECHIPEI</span><strong>{state.score.toLocaleString('ro-RO')}</strong></div><div className="players"><span className="avatar">☺</span><div><b>{me?.name || 'Tu'}</b><small>Tu</small></div><span className="plus">+</span><span className="avatar partner-avatar">☺</span><div><b>{partner?.name || 'Prietena ta'}</b><small>{partner?'Partener':'Se conectează…'}</small></div></div></div>
        {players.length<2 && <div className="waiting-banner"><span className="spinner"/> Trimite invitația pentru a începe împreună.</div>}
        {state.status==='gameover' && <div className="gameover-banner"><strong>GAME OVER</strong><span>Nu mai există nicio mutare posibilă. Scor final: {state.score}</span><button className="secondary-btn" onClick={()=>socket.emit('restartGame',{code:state.code},result=>{if(!result?.ok)setNotice(result?.error||'Nu s-a putut reporni.');})}>Joacă din nou</button></div>}
        <div className={`board ${state.status==='gameover'?'board-ended':''}`} onMouseLeave={()=>setHoverCell(null)}>
          {state.board.map((row,r)=>row.map((cell,c)=>{
            const localPreview = dragging && dragging.pieceIndex===selected && dragging.row!==null && currentPiece?.shape.some(([dx,dy])=>dragging.row+dy===r&&dragging.col+dx===c);
            const remotePreview = Object.values(state.previews || {}).find(p => p.playerId!==playerId && p.shape?.some(([dx,dy])=>p.row+dy===r&&p.col+dx===c));
            const previewColor = remotePreview?.color || currentPiece?.color;
            const localValid = dragging && currentPiece?.shape.every(([dx,dy])=>{const rr=dragging.row+dy,cc=dragging.col+dx;return rr>=0&&rr<N&&cc>=0&&cc<N&&state.board[rr][cc]===null;});
            const remoteValid = remotePreview?.valid;
            const previewClass = remotePreview ? `remote-preview ${remoteValid?'remote-valid':'remote-invalid'} ${previewColor}` : localPreview ? `preview-drag ${localValid?'preview-valid':'preview-invalid'} ${previewColor}` : '';
            return <button key={`${r}-${c}`} data-row={r} data-col={c}
              className={`board-cell ${cell?`occupied ${cell}`:''} ${previewClass}`}
              onMouseEnter={()=>setHoverCell({row:r,col:c})} onFocus={()=>setHoverCell({row:r,col:c})}
              onClick={()=>{if(!suppressClick && !dragging) place(r,c)}} aria-label={`Rând ${r+1}, coloană ${c+1}`} disabled={state.status==='gameover'} />;
          }))}
        </div>
        {dragging && <div className="drag-ghost" style={{left:pointerPos.x,top:pointerPos.y-22}}>
          <span className="drag-ghost-label">Plasează piesa</span>
          <div className="mini-grid" style={{gridTemplateColumns:`repeat(${state.pieces[dragging.pieceIndex].w}, 18px)`,gridTemplateRows:`repeat(${state.pieces[dragging.pieceIndex].h}, 18px)`}}>
            {Array.from({length:state.pieces[dragging.pieceIndex].w*state.pieces[dragging.pieceIndex].h},(_,i)=>{const piece=state.pieces[dragging.pieceIndex],x=i%piece.w,y=Math.floor(i/piece.w);return <span key={i} className={`mini-cell ${piece.shape.some(([sx,sy])=>sx===x&&sy===y)?`filled ${piece.color}`:''}`}/>;})}
          </div>
        </div>}
        {Object.values(state.previews || {}).some(p=>p.playerId!==playerId) && <p className="remote-preview-label">👀 {Object.values(state.previews).find(p=>p.playerId!==playerId)?.playerName} se gândește unde să plaseze piesa…</p>}
        <div className="piece-area"><div className="piece-heading"><div><span className="eyebrow">PIESE COMUNE</span><h3>Alegeți următoarea mutare</h3></div><span className="round-label">Set nou după 3 piese</span></div>
          <div className="pieces">{state.pieces.map((piece,i)=><MiniPiece key={piece.id} piece={piece} selected={selected===i} disabled={state.used[i] || state.status==='gameover'} onClick={()=>setSelected(i)}
            onPointerDown={event=>{if(state.status!=='playing'||players.length<2||state.used[i])return;event.preventDefault();setSelected(i);setPointerPos({x:event.clientX,y:event.clientY});setDragging({pieceIndex:i,row:null,col:null});}}/>)}</div>
          <p className="hint">Selectează o piesă, apoi atinge celula din colțul stânga-sus unde vrei să o plasezi. Pe calculator poți folosi și mouse-ul.</p>
        </div>
      </div>
      <aside className="side-panel">
        <div className="side-card invite-card"><span className="eyebrow">INVITĂ-ȚI PARTENERUL</span><h3>Camera voastră</h3><div className="code-display">{state.code}</div><button className="primary-btn full" onClick={copyLink}>↗ Copiază linkul invitației</button><p>Trimite linkul; dacă nu funcționează, oferă codul camerei.</p></div>
        <div className="side-card"><span className="eyebrow">ECHIPA</span><h3>Jucători ({players.length}/2)</h3>{players.map((p,i)=><div className="player-row" key={p.id}><span className={`avatar ${i===1?'partner-avatar':''}`}>☺</span><span><b>{p.name}</b><small>{p.id===playerId?'Tu':'Partener'}</small></span><span className="online-label">● online</span></div>)}</div>
        <div className="side-card tip-card"><span className="tip-icon">✦</span><div><b>Un mic sfat</b><p>Planificați împreună! Rândurile și coloanele complete dispar și vă aduc puncte bonus.</p></div></div>
        {state.lastAction && <div className="last-action">✨ {state.lastAction}</div>}
        {notice && <div className="notice">{notice}</div>}
        <button className="text-btn" onClick={()=>{setState(null);setPlayerId('');setNotice('');history.replaceState({}, '', location.pathname);}}>← Ieși din cameră</button>
      </aside>
    </section>
    <footer>Block Duo · Un joc de puzzle co-op pentru doi</footer>
  </main>;
}

export default App;
