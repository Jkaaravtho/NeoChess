// fixes
'use strict';

function normalizeFen(fen) {
    if (!fen) return '';
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return fen.trim();
    
    return (parts[0] + ' ' + parts[1]).trim();
}

function getSanMoveSequence(recordedMovesArray) {
     
    return recordedMovesArray.map(m => m.toLowerCase().replace(/[+#x=]/g, '')).join(' ').trim();
}

function getNormalizedOpeningMoves(movesStr) {
    if (!movesStr) return '';
    const cleaned = movesStr.replace(/\d+\s*\.{1,3}/g, ' ');
    
    return cleaned.split(/\s+/).filter(m => m.trim().length > 0).map(m => m.toLowerCase().replace(/[+#x=]/g, '')).join(' ').trim();
}

function compareMoves(playedMove, expectedMove) {
    if (!playedMove || !expectedMove) return false;
    
    const p = playedMove.trim().toLowerCase();
    const e = expectedMove.trim().toLowerCase();
    
    if (p === e) return true;
    
    const pClean = p.replace(/[+#x=]/g, '');
    const eClean = e.replace(/[+#x=]/g, '');
    if (pClean === eClean) return true;
    
    return false;
}

function cleanPgnString(pgn) {
    if (!pgn) return '';
    let cleaned = pgn.replace(/\r?\n/g, '\n').trim();
    
    
    cleaned = cleaned.replace(/\[Date\s+"([^"]*)"\]/gi, (match, dateStr) => {
        let sanitized = dateStr.replace(/[-]/g, '.').replace(/^[+-]/, '');
        let parts = sanitized.split('.');
        if (parts[0] && parts[0].length !== 4) {
            parts[0] = '????'; // Standard PGN wildcard year fallback
        }
        return `[Date "${parts.join('.')}"]`;
    });
    
    return cleaned;
}


function parseMovesOnly(pgnText) {
    const validator = new Chess();
    
    
    let cleanText = pgnText.replace(/\[[^\]]*\]/g, ' ');
    
    
    cleanText = cleanText.replace(/\{[^\}]*\}/g, ' ');
    
    
    cleanText = cleanText.replace(/\([^\)]*\)/g, ' ');
    
    
    cleanText = cleanText.replace(/\d+\s*\.{1,3}/g, ' ');
    
    
    const tokens = cleanText.split(/\s+/);
    const playedMoves = [];
    
    for (let token of tokens) {
        token = token.trim();
        if (!token) continue;
        
        
        if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue;
        
        
        if (token === '0-0') token = 'O-O';
        if (token === '0-0-0') token = 'O-O-O';
        
        try {
            const moveObj = validator.move(token, { sloppy: true });
            if (moveObj) {
                playedMoves.push(moveObj);
            } else {
                
                const cleanToken = token.replace(/[+#x=]/g, '');
                const fallbackMove = validator.move(cleanToken, { sloppy: true });
                if (fallbackMove) {
                    playedMoves.push(fallbackMove);
                }
            }
        } catch (err) {
            try {
                const cleanToken = token.replace(/[+#x=]/g, '');
                const fallbackMove = validator.move(cleanToken, { sloppy: true });
                if (fallbackMove) {
                    playedMoves.push(fallbackMove);
                }
            } catch (err2) {
                // If it is an invalid move, skip 
            }
        }
    }
    
    return playedMoves;
}

function checkSquareAttackedByPawn(chessObj, square, opponentColor) {
    const file = square.charCodeAt(0);
    const rank = parseInt(square.charAt(1), 10);
    
    const direction = opponentColor === 'w' ? -1 : 1;
    const targetRank = rank + direction;
    
    if (targetRank < 1 || targetRank > 8) return false;
    
    const filesToCheck = [];
    if (file > 97) filesToCheck.push(String.fromCharCode(file - 1));
    if (file < 104) filesToCheck.push(String.fromCharCode(file + 1));
    
    for (const f of filesToCheck) {
        const checkSquare = f + targetRank;
        const piece = chessObj.get(checkSquare);
        if (piece && piece.type === 'p' && piece.color === opponentColor) {
            return true;
        }
    }
    return false;
}

function isTacticalSacrifice(chessObj, lastMove, priorTurn) {
    if (!lastMove) return false;
    const opponentColor = priorTurn === 'w' ? 'b' : 'w';
    
    if (lastMove.piece !== 'p' && lastMove.piece !== 'k') {
        if (checkSquareAttackedByPawn(chessObj, lastMove.to, opponentColor)) {
            return true;
        }
    }
    return false;
}

// Fixed function to handle Emscripten locating the .wasm file over CDN when run via blob URL
function createCORSWorker(url) {
    try {
        const urlDir = url.substring(0, url.lastIndexOf('/') + 1);
        const blobCode = `
            self.Module = {
                locateFile: function(path, prefix) {
                    if (path.endsWith('.wasm')) {
                        return "${urlDir}" + path;
                    }
                    return (prefix || "") + path;
                }
            };
            importScripts("${url}");
        `;
        const blob = new Blob([blobCode], { type: "application/javascript" });
        return new Worker(URL.createObjectURL(blob));
    } catch (e) {
        console.warn("CORS Blob Worker block detected.", e);
        return null;
    }
}


const OFFLINE_OPENINGS_FALLBACK = [
    { "name": "Sicilian Defense", "eco": "B20", "moves": "1. e4 c5" },
    { "name": "Sicilian Defense: Najdorf Variation", "eco": "B90", "moves": "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6" },
    { "name": "Ruy Lopez (Spanish Opening)", "eco": "C60", "moves": "1. e4 e5 2. Nf3 Nc6 3. Bb5" },
    { "name": "French Defense", "eco": "C00", "moves": "1. e4 e6 2. d4 d5" },
    { "name": "Queen's Gambit", "eco": "D06", "moves": "1. d4 d5 2. c4" },
    { "name": "Queen's Gambit Declined: Slav Defense", "eco": "D10", "moves": "1. d4 d5 2. c4 c6" },
    { "name": "Caro-Kann Defense", "eco": "B12", "moves": "1. e4 c6 2. d4 d5" },
    { "name": "Italian Game", "eco": "C50", "moves": "1. e4 e5 2. Nf3 Nc6 3. Bc4" },
    { "name": "King's Indian Defense", "eco": "E61", "moves": "1. d4 Nf6 2. c4 g6" },
    { "name": "Scandinavian Defense", "eco": "B01", "moves": "1. e4 d5 2. exd5 Qxd5" },
    { "name": "English Opening", "eco": "A10", "moves": "1. c4 e5" },
    { "name": "Reti Opening", "eco": "A04", "moves": "1. Nf3 d5" }
];