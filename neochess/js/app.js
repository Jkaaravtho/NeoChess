// handler
'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const boardDOM = document.getElementById('my-board');
    
    // bl Timer
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => splash.remove(), 700);
        }
    }, 2000);

    if (typeof Chess === 'undefined') {
        console.error("Critical: chess.js failed to load.");
        if (boardDOM) {
            boardDOM.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center p-6 bg-slate-950 text-slate-300">
                    <h3 class="heading-font font-bold text-sm text-slate-200">Rules Engine Blocked</h3>
                    <p class="text-[11px] text-slate-500 mt-2 max-w-[240px] leading-relaxed">
                        The browser failed to load the <strong>chess.js</strong> dependency. Verify your /js folder contains chess.min.js.
                    </p>
                </div>
            `;
        }
        return;
    }

    try {
        window.game = new Chess();
    } catch (e) {
        console.warn("Falling back to window.Chess syntax.");
        window.game = new window.Chess();
    }

    const boardConfig = {
        draggable: true,
        position: 'start',
        onDragStart: window.onDragStart || onDragStart,
        onDrop: window.onDrop || onDrop,
        onSnapEnd: window.onSnapEnd || onSnapEnd,
        pieceTheme: 'img/wikipedia/{piece}.png'
    };

    window.board = Chessboard('my-board', boardConfig);

    if (boardDOM) {
        const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgOverlay.setAttribute('id', 'board-arrows');
        svgOverlay.setAttribute('class', 'absolute inset-0 pointer-events-none w-full h-full z-10');
        svgOverlay.style.overflow = 'visible';
        svgOverlay.innerHTML = `
            <defs>
                <marker id="arrow-head-1" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,1 L0,5 L5,3 Z" fill="rgba(6, 182, 212, 0.85)" />
                </marker>
                <marker id="arrow-head-2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,1 L0,5 L5,3 Z" fill="rgba(139, 92, 246, 0.75)" />
                </marker>
                <marker id="arrow-head-3" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,1 L0,5 L5,3 Z" fill="rgba(16, 185, 129, 0.7)" />
                </marker>
            </defs>
        `;
        boardDOM.appendChild(svgOverlay);
    }

    window.addEventListener('resize', () => {
        if (window.board) {
            window.board.resize();
            drawArrows();
        }
    });

    if (boardDOM) {
        boardDOM.addEventListener('touchstart', window.handleCapturedInput || handleCapturedInput, { capture: true, passive: true });
        boardDOM.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                const trigger = window.handleCapturedInput || handleCapturedInput;
                trigger(e);
            }
        }, { capture: true });
    }

    const importBtn = document.getElementById('import-btn');
    const pgnInput = document.getElementById('pgn-input');
    const exportBtn = document.getElementById('export-btn');
    const moveHistoryContainer = document.getElementById('move-history');
    
    const btnFirst = document.getElementById('nav-first');
    const btnBack = document.getElementById('nav-back');
    const btnPlay = document.getElementById('nav-play');
    const btnForward = document.getElementById('nav-forward');
    const btnLast = document.getElementById('nav-last');

    const theoryRetryBtn = document.getElementById('theory-retry-btn');
    const theoryReadBtn = document.getElementById('theory-read-btn');
    
    const openingsToggleBtn = document.getElementById('openings-toggle-btn');
    const openingsSearchWrapper = document.getElementById('openings-search-wrapper');
    const openingsListContainer = document.getElementById('openings-list-container');
    const openingsSearch = document.getElementById('openings-search');
    
    const openBtn = document.getElementById('open-sidebar-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    const resetBtn = document.getElementById('reset-board-btn');
    const clearBtn = document.getElementById('clear-board-btn');
    const flipBtn = document.getElementById('flip-board-btn');

    const sideWhiteBtn = document.getElementById('ai-side-white');
    const sideRandomBtn = document.getElementById('ai-side-random');
    const sideBlackBtn = document.getElementById('ai-side-black');
    const aiDifficultySlider = document.getElementById('ai-difficulty');
    const aiDifficultyDisplay = document.getElementById('ai-difficulty-display');
    const initiateMatchBtn = document.getElementById('initiate-match-btn');

    const engineToggleBtn = document.getElementById('engine-toggle-btn');
    const arrowCountBtn = document.getElementById('arrow-count-btn');
    const arrowCountText = document.getElementById('arrow-count-text');

    const puzzlesToggleBtn = document.getElementById('puzzles-toggle-btn');
    const puzzleEloSlider = document.getElementById('puzzle-elo-slider');
    const nextPuzzleBtn = document.getElementById('next-puzzle-btn');
    const skipPuzzleBtn = document.getElementById('skip-puzzle-btn');
    const resetPuzzleBtn = document.getElementById('reset-puzzle-btn');

    const puzzleDecDiff = document.getElementById('puzzle-dec-diff');
    const puzzleIncDiff = document.getElementById('puzzle-inc-diff');
    const puzzleHintBtn = document.getElementById('puzzle-hint-btn');
    const puzzleSolutionBtn = document.getElementById('puzzle-solution-btn');
    const puzzleStudyNextBtn = document.getElementById('puzzle-study-next-btn');

    // btns
    const creditsBtn = document.getElementById('credits-btn');
    const creditsModalBackdrop = document.getElementById('credits-modal-backdrop');
    const closeCreditsBtn = document.getElementById('close-credits-btn');

    if (btnFirst) btnFirst.addEventListener('click', () => {
        if (window.isBranchActive) {
            window.deleteBranch();
        }
        const trigger = window.syncRulesEngineToHistoryIndex || syncRulesEngineToHistoryIndex;
        trigger(0);
    });
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (window.isBranchActive && window.currentHistoryIndex === window.branchStartHistoryIndex + 1) {
                window.deleteBranch();
                return;
            }
            if (window.currentHistoryIndex > 0) {
                const trigger = window.syncRulesEngineToHistoryIndex || syncRulesEngineToHistoryIndex;
                trigger(window.currentHistoryIndex - 1);
            }
        });
    }
    if (btnForward) {
        btnForward.addEventListener('click', () => {
            if (window.currentHistoryIndex < window.fenHistory.length - 1) {
                const trigger = window.syncRulesEngineToHistoryIndex || syncRulesEngineToHistoryIndex;
                trigger(window.currentHistoryIndex + 1);
            }
        });
    }
    if (btnLast) btnLast.addEventListener('click', () => {
        const trigger = window.syncRulesEngineToHistoryIndex || syncRulesEngineToHistoryIndex;
        trigger(window.fenHistory.length - 1);
    });
    if (btnPlay) btnPlay.addEventListener('click', window.toggleAutoplay || toggleAutoplay);

    if (moveHistoryContainer) {
        moveHistoryContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-index]');
            if (btn) {
                const line = btn.getAttribute('data-line');
                const index = parseInt(btn.getAttribute('data-index'), 10);
                
                // dlt branch
                if (window.isBranchActive && line === 'main') {
                    if (window.deleteBranch) {
                        window.deleteBranch();
                    }
                }
                
                const trigger = window.syncRulesEngineToHistoryIndex || syncRulesEngineToHistoryIndex;
                trigger(index + 1);
            }
        });
    }

    if (importBtn && pgnInput) {
        importBtn.addEventListener('click', () => {
            const rawText = pgnInput.value.trim();
            if (!rawText) return;

            const validator = new Chess();

            if (validator.load(rawText)) {
                window.startingFen = rawText;
                window.recordedMoves = [];
                window.fenHistory = [rawText];
                window.currentHistoryIndex = 0;

                window.game.load(rawText);
                window.board.position(rawText);

                if (window.updateMoveHistory) window.updateMoveHistory();
                if (window.removeHighlights) window.removeHighlights();
                if (window.clearAssessmentVisuals) window.clearAssessmentVisuals();
                window.lastRenderedBadgeFen = '';
                window.selectedSquare = null;
                alert("FEN position parsed successfully.");
                
                if (window.engineActive) updateEnginePosition();
                return;
            }

            const playedMoves = parseMovesOnly(rawText);

            if (playedMoves.length > 0) {
                window.game.reset();
                window.startingFen = 'start';
                window.recordedMoves = [];
                window.fenHistory = ['start'];

                playedMoves.forEach(m => {
                    window.game.move(m);
                    window.recordedMoves.push(m.san);
                    window.fenHistory.push(window.game.fen());
                });

                window.currentHistoryIndex = window.fenHistory.length - 1;
                window.board.position(window.game.fen());

                if (window.updateMoveHistory) window.updateMoveHistory();
                if (window.removeHighlights) window.removeHighlights();
                if (window.clearAssessmentVisuals) window.clearAssessmentVisuals();
                window.lastRenderedBadgeFen = '';
                window.selectedSquare = null;
                alert("PGN history timeline parsed successfully.");
                
                if (window.engineActive) updateEnginePosition();
                return;
            }

            alert("Parser Error: Invalid notation. Verify PGN or FEN structures.");
        });
    }

    if (exportBtn && pgnInput) {
        exportBtn.addEventListener('click', () => {
            const outputPgn = window.game.pgn();
            if (outputPgn) {
                pgnInput.value = outputPgn;
                alert("PGN moves exported.");
            } else {
                pgnInput.value = window.game.fen();
                alert("No moves tracked. Core FEN exported instead.");
            }
        });
    }

    if (sideWhiteBtn) sideWhiteBtn.addEventListener('click', () => {
        if (window.selectSide) window.selectSide('w');
    });
    if (sideRandomBtn) sideRandomBtn.addEventListener('click', () => {
        if (window.selectSide) window.selectSide('random');
    });
    if (sideBlackBtn) sideBlackBtn.addEventListener('click', () => {
        if (window.selectSide) window.selectSide('b');
    });

    if (aiDifficultySlider && aiDifficultyDisplay) {
        aiDifficultySlider.addEventListener('input', (e) => {
            window.aiDifficulty = parseInt(e.target.value, 10);
            aiDifficultyDisplay.innerText = `Level ${window.aiDifficulty}`;
        });
    }

    if (initiateMatchBtn) {
        initiateMatchBtn.addEventListener('click', () => {
            if (!window.stockfish && !window.engineIsMock) initStockfish();

            window.isAiMatchActive = true;
            window.aiIsThinking = false;
            window.activePracticeOpening = null;

            if (window.aiSide === 'random') {
                window.resolvedAiColor = Math.random() < 0.5 ? 'w' : 'b';
            } else {
                window.resolvedAiColor = window.aiSide;
            }

            window.startingFen = 'start';
            window.recordedMoves = [];
            window.fenHistory = ['start'];
            window.currentHistoryIndex = 0;
            window.lastCalculatedFen = '';
            window.lastDetectedOpening = null;

            window.game.reset();
            window.board.position('start');
            if (window.updateMoveHistory) window.updateMoveHistory();
            if (window.clearAssessmentVisuals) window.clearAssessmentVisuals();
            window.lastRenderedBadgeFen = '';

            alert(`AI Match Initiated! AI Color: ${window.resolvedAiColor === 'w' ? 'White' : 'Black'}. Level: ${window.aiDifficulty}`);
            if (window.toggleSidebar) window.toggleSidebar();

            if (window.checkAndTriggerAiMove) window.checkAndTriggerAiMove();
        });
    }

    if (openBtn) openBtn.addEventListener('click', window.toggleSidebar || toggleSidebar);
    if (closeBtn) closeBtn.addEventListener('click', window.toggleSidebar || toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', window.toggleSidebar || toggleSidebar);

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            window.startingFen = 'start';
            window.recordedMoves = [];
            window.fenHistory = ['start'];
            window.currentHistoryIndex = 0;
            window.lastCalculatedFen = '';
            window.activePracticeOpening = null;
            window.isAiMatchActive = false;
            window.aiIsThinking = false;
            window.lastDetectedOpening = null;

            window.game.reset();
            window.board.position('start');
            if (window.updateMoveHistory) window.updateMoveHistory();
            if (window.removeHighlights) window.removeHighlights();
            if (window.clearAssessmentVisuals) window.clearAssessmentVisuals();
            window.lastRenderedBadgeFen = '';
            if (window.toggleSidebar) window.toggleSidebar();

            if (window.engineActive) updateEnginePosition();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            window.startingFen = 'start';
            window.recordedMoves = [];
            window.fenHistory = ['start'];
            window.currentHistoryIndex = 0;
            window.lastCalculatedFen = '';
            window.activePracticeOpening = null;
            window.isAiMatchActive = false;
            window.aiIsThinking = false;
            window.lastDetectedOpening = null;

            window.game.reset();
            window.board.position('start');
            if (window.updateMoveHistory) window.updateMoveHistory();
            if (window.removeHighlights) window.removeHighlights();
            if (window.clearAssessmentVisuals) window.clearAssessmentVisuals();
            window.lastRenderedBadgeFen = '';
            if (window.toggleSidebar) window.toggleSidebar();

            if (window.engineActive) updateEnginePosition();
        });
    }

    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            if (window.board) window.board.flip();
            setTimeout(drawArrows, 100);
        });
    }

    if (theoryRetryBtn) theoryRetryBtn.addEventListener('click', window.hideTheoryModal || hideTheoryModal);
    if (theoryReadBtn) {
        theoryReadBtn.addEventListener('click', () => {
            if (window.hideTheoryModal) window.hideTheoryModal();
            readRemainingOpening();
        });
    }

    if (openingsToggleBtn && openingsListContainer && openingsSearchWrapper) {
        openingsToggleBtn.addEventListener('click', () => {
            openingsSearchWrapper.classList.toggle('hidden');
            openingsListContainer.classList.toggle('hidden');
            if (!openingsListContainer.classList.contains('hidden')) {
                renderOpeningsList();
                if (openingsSearch) {
                    openingsSearch.value = '';
                    openingsSearch.focus();
                }
            }
        });
    }

    if (openingsSearch) {
        openingsSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            renderOpeningsList(query);
        });
    }

    if (engineToggleBtn) engineToggleBtn.addEventListener('click', window.toggleEngine || toggleEngine);

    if (arrowCountBtn) {
        arrowCountBtn.addEventListener('click', () => {
            window.activeArrowCount = (window.activeArrowCount % 3) + 1;
            if (arrowCountText) {
                arrowCountText.innerText = `Paths: ${window.activeArrowCount}`;
            }
            drawArrows();
        });
    }

    if (puzzlesToggleBtn) {
        puzzlesToggleBtn.addEventListener('click', () => {
            togglePuzzleHub();
            if (window.toggleSidebar) window.toggleSidebar();
        });
    }

    if (puzzleEloSlider) {
        updateSliderColoring(parseInt(puzzleEloSlider.value, 10));
        
        puzzleEloSlider.addEventListener('input', (e) => {
            const ratingValue = parseInt(e.target.value, 10);
            window.puzzleEloFilter = ratingValue;
            updateSliderColoring(ratingValue);
        });
    }

    if (nextPuzzleBtn) nextPuzzleBtn.addEventListener('click', loadNewPuzzle);
    if (skipPuzzleBtn) skipPuzzleBtn.addEventListener('click', skipPuzzle);
    if (resetPuzzleBtn) resetPuzzleBtn.addEventListener('click', restartPuzzle);

    if (puzzleDecDiff) {
        puzzleDecDiff.addEventListener('click', () => {
            adjustPuzzleElo(-150);
        });
    }
    if (puzzleIncDiff) {
        puzzleIncDiff.addEventListener('click', () => {
            adjustPuzzleElo(150);
        });
    }
    if (puzzleHintBtn) {
        puzzleHintBtn.addEventListener('click', showPuzzleHint);
    }
    if (puzzleSolutionBtn) {
        puzzleSolutionBtn.addEventListener('click', playPuzzleSolution);
    }
    if (puzzleStudyNextBtn) {
        puzzleStudyNextBtn.addEventListener('click', () => {
            puzzleStudyNextBtn.classList.add('hidden');
            
            if (puzzleHintBtn) puzzleHintBtn.disabled = false;
            if (puzzleSolutionBtn) puzzleSolutionBtn.disabled = false;

            window.puzzleSolutionShown = false;
            loadNewPuzzle();
        });
    }

    // crds
    if (creditsBtn && creditsModalBackdrop) {
        creditsBtn.addEventListener('click', () => {
            creditsModalBackdrop.classList.remove('hidden');
        });
    }
    if (closeCreditsBtn && creditsModalBackdrop) {
        closeCreditsBtn.addEventListener('click', () => {
            creditsModalBackdrop.classList.add('hidden');
        });
    }
    if (creditsModalBackdrop) {
        creditsModalBackdrop.addEventListener('click', (e) => {
            if (e.target === creditsModalBackdrop) {
                creditsModalBackdrop.classList.add('hidden');
            }
        });
    }

    initStockfish();
    fetchEcoOpenings();
    loadLocalPuzzles();
});