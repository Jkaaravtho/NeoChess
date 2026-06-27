// stocfish
'use strict';

function initStockfish() {
    if (window.stockfish || window.engineIsMock) return;

    const localEnginePath = 'js/engine/stockfish.js';
    
    const fallbackCDNUrl = 'https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js';

    console.log("Initiating Stockfish Web Worker...");
    window.engineConnected = false;

    if (window.handshakeTimeout) {
        clearTimeout(window.handshakeTimeout);
        window.handshakeTimeout = null;
    }

    try {
        window.stockfish = new Worker(localEnginePath);
        window.stockfish.onerror = (err) => {
            console.warn("Local Worker blocked. Initializing CDN Web worker...", err);
            fallbackToCDN(fallbackCDNUrl);
        };
    } catch (e) {
        console.warn("Worker sandboxing blocked on file:// protocol. Falling back to CDN worker context...", e);
        fallbackToCDN(fallbackCDNUrl);
        return;
    }

    window.handshakeTimeout = setTimeout(() => {
        if (!window.engineConnected && !window.engineIsMock) {
            console.warn("Local Handshake Timeout. Forcing CDN Fallback...");
            fallbackToCDN(fallbackCDNUrl);
        }
    }, 1500);

    setupEngineListeners();
}

function setupEngineListeners() {
    if (!window.stockfish) return;

    let lastParsedTime = 0;

    window.stockfish.addEventListener('message', (e) => {
        const data = e.data;

       
        if (window.isReviewActive) {
            return;
        }

        if (data.startsWith('readyok') || data.startsWith('uciok')) {
            window.engineConnected = true;
            window.stockfish.postMessage('setoption name Hash value 64');
            window.stockfish.postMessage('setoption name MultiPV value 3');
            
            if (window.engineActive) {
                sendGoCommandForFen(window.fenHistory[window.currentHistoryIndex]);
            }
            return;
        }

        if (data.startsWith('bestmove')) {
            window.engineIsSearching = false;

            const tokens = data.split(' ');
            const bestMoveStr = tokens[1];

            if (window.isAiMatchActive && window.aiIsThinking) {
                handleAiBestMove(bestMoveStr);
                return;
            }
            
            if (window.pendingSearchFen !== null) {
                const nextFen = window.pendingSearchFen;
                window.pendingSearchFen = null;
                sendGoCommandForFen(nextFen);
            }
            return;
        }

        if (window.engineActive && !window.aiIsThinking) {
            if (window.pendingSearchFen !== null) return;

            if (data.startsWith('info')) {
                const now = Date.now();
                if (window.isFirstLineForCurrentPosition || (now - lastParsedTime > 60)) {
                    lastParsedTime = now;
                    parseUCIInfo(data);
                }
            }
        }
    });

    window.stockfish.postMessage('uci');
    window.stockfish.postMessage('isready');
}

function fallbackToCDN(url) {
    if (window.handshakeTimeout) {
        clearTimeout(window.handshakeTimeout);
        window.handshakeTimeout = null;
    }
    if (window.stockfish) {
        try { window.stockfish.terminate(); } catch (e) {}
        window.stockfish = null;
    }
    console.log("Compiling backup engine worker...");
    window.stockfish = createCORSWorker(url);
    if (window.stockfish) {
        setupEngineListeners();
    } else {
        console.warn("CORS Web Worker blocked. Activating Local Engine Failover UI.");
        triggerMockEngineFailover();
    }
}

function triggerMockEngineFailover() {
    window.engineIsMock = true;
    const warningBadge = document.getElementById('protocol-warning-badge');
    const depthEl = document.getElementById('engine-depth');
    const npsEl = document.getElementById('engine-nps');
    if (warningBadge) warningBadge.classList.remove('hidden');
    if (depthEl) depthEl.innerText = "Theory Mode";
    if (npsEl) npsEl.innerText = "0 kN/s";
}

function sendGoCommandForFen(fen) {
    if (!window.stockfish || !window.engineActive || window.engineIsMock) return;

    window.isFirstLineForCurrentPosition = true;
    window.activeSearchFen = fen; // Track the active FEN being searched
    if (fen === 'start') {
        window.activeSearchTurn = 'w';
        window.stockfish.postMessage('position startpos');
    } else {
        const parts = fen.split(' ');
        window.activeSearchTurn = parts[1] || 'w';
        window.stockfish.postMessage(`position fen ${fen}`);
    }
    
    window.stockfish.postMessage('go infinite'); 
    window.engineIsSearching = true;
}

function updateEnginePosition() {
    if (window.isReviewActive) return; // Prevent automatic calculations dw
    if (window.engineIsMock) {
        triggerMockEngineFailover();
        return;
    }
    if (!window.stockfish || !window.engineActive) return;

    const currentFen = window.fenHistory[window.currentHistoryIndex];
    if (currentFen === window.lastCalculatedFen) return;
    window.lastCalculatedFen = currentFen;

    if (window.guiUpdateTimeout) {
        clearTimeout(window.guiUpdateTimeout);
        window.guiUpdateTimeout = null;
    }
    window.guiUpdatePending = false;

    window.currentMultiPVData = {};
    clearAssessmentVisuals();

    const svg = document.getElementById('board-arrows');
    if (svg) $(svg).find('path.arrow-path').remove();

    for (let mpv = 1; mpv <= 3; mpv++) {
        const lineEl = document.getElementById(`engine-line-${mpv}`);
        if (lineEl) {
            lineEl.innerHTML = `<span class="text-slate-500 font-bold">#${mpv}:</span> Thinking...`;
        }
    }

    if (window.engineIsSearching) {
        window.pendingSearchFen = currentFen;
        window.stockfish.postMessage('stop');
    } else {
        window.pendingSearchFen = null;
        if (window.engineConnected) {
            sendGoCommandForFen(currentFen);
        }
    }
}

function updateEvalBar(scoreVal, isMate, labelStr) {
    const evalWhite = document.getElementById('eval-white');
    const evalBlack = document.getElementById('eval-black');
    const evalText = document.getElementById('eval-text');
    if (!evalWhite || !evalBlack || !evalText) return;

    let percentage = 50;

    if (isMate) {
        percentage = scoreVal > 0 ? 95 : 5;
    } else {
        // Convert centipawns
        const scoreInPawns = scoreVal / 100;
        percentage = 50 + (scoreInPawns * 10);
        percentage = Math.max(5, Math.min(95, percentage));
    }

    evalWhite.style.height = `${percentage}%`;
    evalBlack.style.height = `${100 - percentage}%`;
    evalText.innerText = labelStr;
    evalText.style.top = `${100 - percentage}%`; // Align the vertical center 
}

function scheduleGUIUpdate() {
    if (window.guiUpdatePending) return;
    window.guiUpdatePending = true;

    window.guiUpdateTimeout = setTimeout(() => {
        window.guiUpdatePending = false;
        if (window.engineActive) {
            updateEngineLinesGUI();
        }
    }, 100);
}

function parseEngineScore(scoreType, scoreValue) {
    if (scoreType === 'mate') {
        const absVal = Math.abs(scoreValue);
        const sign = scoreValue >= 0 ? 1 : -1;
        const normalizedCp = sign * (10000 - absVal);
        return {
            isMate: true,
            scoreVal: scoreValue,
            cp: normalizedCp,
            label: `M${absVal}`
        };
    } else {
        const scoreVal = scoreValue / 100;
        const sign = scoreVal >= 0 ? '+' : '';
        return {
            isMate: false,
            scoreVal: scoreValue,
            cp: scoreValue,
            label: sign + scoreVal.toFixed(2)
        };
    }
}

function parseUCIInfo(msg) {
    const tokens = msg.split(' ');

    const depthEl = document.getElementById('engine-depth');
    const npsEl = document.getElementById('engine-nps');

    let depth = 0;
    const depthIdx = tokens.indexOf('depth');
    if (depthIdx !== -1) {
        depth = parseInt(tokens[depthIdx + 1], 10);
        if (depthEl) depthEl.innerText = `Depth: ${depth}`;
    }

    const npsIdx = tokens.indexOf('nps');
    if (npsIdx !== -1) {
        const nps = parseInt(tokens[npsIdx + 1], 10);
        if (npsEl) npsEl.innerText = `${Math.round(nps / 1000)} kN/s`;
    }

    let mpv = 1;
    const mpvIdx = tokens.indexOf('multipv');
    if (mpvIdx !== -1) {
        mpv = parseInt(tokens[mpvIdx + 1], 10);
    } else {
        if (tokens.indexOf('pv') === -1) return;
    }

    if (mpv > 3) return;

    const pvIdx = tokens.indexOf('pv');
    let pvMoves = [];
    if (pvIdx !== -1) {
        pvMoves = tokens.slice(pvIdx + 1);
    }

    if (!window.currentMultiPVData[mpv]) {
        window.currentMultiPVData[mpv] = { score: '0.00', scoreVal: 0, cp: 0, isMate: false, pv: [] };
    }

    const scoreIdx = tokens.indexOf('score');
    if (scoreIdx !== -1) {
        const scoreType = tokens[scoreIdx + 1];
        let value = parseInt(tokens[scoreIdx + 2], 10);

        if (window.activeSearchTurn === 'b') {
            value = -value;
        }

        const parsed = parseEngineScore(scoreType, value);
        window.currentMultiPVData[mpv].score = parsed.label;
        window.currentMultiPVData[mpv].scoreVal = parsed.scoreVal;
        window.currentMultiPVData[mpv].cp = parsed.cp;
        window.currentMultiPVData[mpv].isMate = parsed.isMate;

        // Timeline Isolation Guard
        if (mpv === 1 && !window.isReviewActive) {
            const currentFen = window.fenHistory[window.currentHistoryIndex];
            if (window.activeSearchFen === currentFen) {
                window.evaluatedScores[currentFen] = parsed.cp;
            }
        }
    }

    if (pvIdx !== -1) {
        window.currentMultiPVData[mpv].pv = pvMoves;
    }

    if (window.isFirstLineForCurrentPosition) {
        window.isFirstLineForCurrentPosition = false;
        if (window.guiUpdateTimeout) {
            clearTimeout(window.guiUpdateTimeout);
            window.guiUpdateTimeout = null;
        }
        window.guiUpdatePending = false;
        updateEngineLinesGUI();
    } else {
        scheduleGUIUpdate();
    }
}

function updateEngineLinesGUI() {
    for (let mpv = 1; mpv <= 3; mpv++) {
        const lineEl = document.getElementById(`engine-line-${mpv}`);
        if (!lineEl) continue;

        const data = window.currentMultiPVData[mpv];
        if (data && data.pv && data.pv.length > 0) {
            const movesStr = data.pv.slice(0, 5).join(' ');
            let colorClass = 'text-cyber-accent';
            if (mpv === 2) colorClass = 'text-purple-400';
            if (mpv === 3) colorClass = 'text-emerald-400';

            lineEl.innerHTML = `<span class="${colorClass} font-bold">#${mpv} (${data.score}):</span> ${movesStr}...`;
        } else {
            lineEl.innerHTML = `<span class="text-slate-500 font-bold">#${mpv}:</span> --`;
        }
    }

    const bestLine = window.currentMultiPVData[1];
    if (bestLine && window.engineActive) {
        updateEvalBar(bestLine.scoreVal, bestLine.isMate, bestLine.score);
        if (bestLine.pv && bestLine.pv.length > 0) {
            window.predictedBestMove = bestLine.pv[0];
            const currentFen = window.fenHistory[window.currentHistoryIndex];
            window.bestMoveCache[currentFen] = window.predictedBestMove;
        }
    }

    
    const mainLineEl = document.getElementById('engine-main-line');
    if (mainLineEl) {
        if (bestLine && bestLine.pv && bestLine.pv.length > 0) {
            const movesStr = bestLine.pv.slice(0, 6).join(' ');
            mainLineEl.innerHTML = `<span class="text-cyber-accent font-bold">(${bestLine.score})</span> ${movesStr}`;
        } else {
            mainLineEl.innerHTML = 'Thinking...';
        }
    }

    drawArrows();

    const depthEl = document.getElementById('engine-depth');
    const depthText = depthEl ? depthEl.innerText : '0';
    const currentDepth = parseInt(depthText.replace(/^\D+/g, ''), 10) || 0;

    const currentFen = window.fenHistory[window.currentHistoryIndex];
    if (currentFen !== window.lastRenderedBadgeFen && currentDepth >= 10) {
        window.lastRenderedBadgeFen = currentFen;
        renderMoveAssessment();
    }
}

function getSquareCenter(square) {
    const boardEl = $('#my-board');
    const boardOffset = boardEl.offset();
    const squareEl = boardEl.find('.square-' + square);
    if (!boardOffset || squareEl.length === 0) return null;

    const squareOffset = squareEl.offset();
    const size = squareEl.width();

    const x = squareOffset.left - boardOffset.left + (size / 2);
    const y = squareOffset.top - boardOffset.top + (size / 2);
    return { x, y };
}

function drawCoachArrow(bestMoveUci) {
    const svg = document.getElementById('board-arrows');
    if (!svg) return;

    $(svg).find('path.arrow-path').remove();
    if (!bestMoveUci || bestMoveUci === '(none)') return;

    const source = bestMoveUci.slice(0, 2);
    const target = bestMoveUci.slice(2, 4);

    const sourceCenter = getSquareCenter(source);
    const targetCenter = getSquareCenter(target);

    if (!sourceCenter || !targetCenter) return;

    const x1 = sourceCenter.x;
    const y1 = sourceCenter.y;
    const x2 = targetCenter.x;
    const y2 = targetCenter.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;

    const shortenAmount = 24;
    const x2_short = x2 - (dx / distance) * shortenAmount;
    const y2_short = y2 - (dy / distance) * shortenAmount;

    const strokeColor = 'rgba(16, 185, 129, 0.85)'; //  Green
    const markerId = 'arrow-head-3'; // Green marker head

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} L ${x2_short} ${y2_short}`);
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '4');
    path.setAttribute('fill', 'none');
    path.setAttribute('class', 'arrow-path');
    path.setAttribute('marker-end', `url(#${markerId})`);

    svg.appendChild(path);
}

function drawArrows() {
    const svg = document.getElementById('board-arrows');
    if (!svg) return;

    // Preserve the active coach arrow 
    const coachBox = document.getElementById('coach-box');
    const isCoachActive = coachBox && !coachBox.classList.contains('hidden');

    if (isCoachActive) {
        const currentFen = window.fenHistory[window.currentHistoryIndex];
        const bestMoveUci = window.bestMoveCache[currentFen];
        if (bestMoveUci) {
            drawCoachArrow(bestMoveUci);
            return;
        }
    }

    $(svg).find('path.arrow-path').remove();
    if (!window.engineActive || window.engineIsMock) return;

    for (let mpv = 1; mpv <= window.activeArrowCount; mpv++) {
        const line = window.currentMultiPVData[mpv];
        if (!line || !line.pv || line.pv.length === 0) continue;

        const bestMove = line.pv[0];
        const source = bestMove.slice(0, 2);
        const target = bestMove.slice(2, 4);

        const sourceCenter = getSquareCenter(source);
        const targetCenter = getSquareCenter(target);

        if (!sourceCenter || !targetCenter) continue;

        const x1 = sourceCenter.x;
        const y1 = sourceCenter.y;
        const x2 = targetCenter.x;
        const y2 = targetCenter.y;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) continue;

        const shortenAmount = 24;
        const x2_short = x2 - (dx / distance) * shortenAmount;
        const y2_short = y2 - (dy / distance) * shortenAmount;

        let strokeColor = 'rgba(6, 182, 212, 0.85)';
        let markerId = 'arrow-head-1';
        if (mpv === 2) {
            strokeColor = 'rgba(139, 92, 246, 0.75)';
            markerId = 'arrow-head-2';
        } else if (mpv === 3) {
            strokeColor = 'rgba(16, 185, 129, 0.7)';
            markerId = 'arrow-head-3';
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} L ${x2_short} ${y2_short}`);
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '4');
        path.setAttribute('fill', 'none');
        path.setAttribute('class', 'arrow-path');
        path.setAttribute('marker-end', `url(#${markerId})`);

        svg.appendChild(path);
    }
}

window.drawCoachArrow = drawCoachArrow;