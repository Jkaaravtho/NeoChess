(function (global) {
  'use strict';

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };

  const PIECE_NAMES = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king'
  };

  const KNIGHT_OFFSETS = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];

  const KING_OFFSETS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
  ];

  const DIAG_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const SAFE_THRESHOLD = 0;
  const HANG_THRESHOLD = 0.5;

  // Modified thresholds to match specifications (expressed in centipawns)
  const DEFAULT_THRESHOLDS = {
    good: 50,          // < 0.5 pawn evaluation change
    inaccuracy: 120,   // 0.5 to 1.2 pawn evaluation change
    mistake: 200       // 1.2 to 2.0 pawn evaluation change
  };                   // > 2.0 is graded as blunder

  const FREE_CAPTURE_THRESHOLD = 1.5;
  const FREE_CAPTURE_MARGIN = 1;

  const WINNING_EVAL_THRESHOLD = 200;
  const DRAWISH_EVAL_THRESHOLD = 50;

  const BADGES = {
    best: 'badges/best.png',
    good: 'badges/good.png',
    inaccuracy: 'badges/inaccuracy.png',
    mistake: 'badges/mistake.png',
    blunder: 'badges/blunder.png',
    forced: 'badges/best.png'
  };

  const HEADLINES = {
    best: 'Best Move',
    good: 'Good',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
    forced: 'Forced Move'
  };

  function inBounds(r, c) {
    return r >= 0 && r <= 7 && c >= 0 && c <= 7;
  }

  function squareToRowCol(square) {
    const col = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10);
    const row = 8 - rank;
    return { row, col };
  }

  function rowColToSquare(row, col) {
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    return file + rank;
  }

  function parseFenBoard(fen) {
    const placement = fen.split(' ')[0];
    const rows = placement.split('/');
    if (rows.length !== 8) {
      throw new Error('chess-review: invalid FEN board ("' + fen + '")');
    }
    const board = [];
    for (let i = 0; i < 8; i++) {
      const row = [];
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') {
          const empties = parseInt(ch, 10);
          for (let k = 0; k < empties; k++) row.push(null);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          row.push({ type: ch.toLowerCase(), color });
        }
      }
      if (row.length !== 8) {
        throw new Error('chess-review: malformed FEN rank "' + rows[i] + '"');
      }
      board.push(row);
    }
    return board;
  }

  function cloneBoard(board) {
    return board.map(row => row.map(cell => (cell ? { type: cell.type, color: cell.color } : null)));
  }

  function isEndgame(board) {
    let pieceCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type !== 'p' && p.type !== 'k') {
          pieceCount++;
        }
      }
    }
    return pieceCount <= 6;
  }

  function getCoverageSquares(board, row, col) {
    const piece = board[row][col];
    if (!piece) return [];
    const result = [];
    const add = (r, c) => {
      if (inBounds(r, c)) result.push({ row: r, col: c });
    };

    switch (piece.type) {
      case 'p':
        if (piece.color === 'w') {
          add(row - 1, col - 1);
          add(row - 1, col + 1);
        } else {
          add(row + 1, col - 1);
          add(row + 1, col + 1);
        }
        break;
      case 'n':
        for (const [dr, dc] of KNIGHT_OFFSETS) add(row + dr, col + dc);
        break;
      case 'k':
        for (const [dr, dc] of KING_OFFSETS) add(row + dr, col + dc);
        break;
      case 'b':
        slideCoverage(board, row, col, DIAG_DIRS, result);
        break;
      case 'r':
        slideCoverage(board, row, col, ORTHO_DIRS, result);
        break;
      case 'q':
        slideCoverage(board, row, col, DIAG_DIRS, result);
        slideCoverage(board, row, col, ORTHO_DIRS, result);
        break;
    }
    return result;
  }

  function slideCoverage(board, row, col, dirs, result) {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        result.push({ row: r, col: c });
        if (board[r][c]) break;
        r += dr;
        c += dc;
      }
    }
  }

  function findAttackers(board, row, col, color) {
    const attackers = [];

    if (color === 'w') {
      checkAttacker(board, row + 1, col - 1, 'w', 'p', attackers);
      checkAttacker(board, row + 1, col + 1, 'w', 'p', attackers);
    } else {
      checkAttacker(board, row - 1, col - 1, 'b', 'p', attackers);
      checkAttacker(board, row - 1, col + 1, 'b', 'p', attackers);
    }

    for (const [dr, dc] of KNIGHT_OFFSETS) {
      checkAttacker(board, row + dr, col + dc, color, 'n', attackers);
    }

    for (const [dr, dc] of KING_OFFSETS) {
      checkAttacker(board, row + dr, col + dc, color, 'k', attackers);
    }

    slideAttackers(board, row, col, DIAG_DIRS, color, ['b', 'q'], attackers);
    slideAttackers(board, row, col, ORTHO_DIRS, color, ['r', 'q'], attackers);

    return attackers;
  }

  function checkAttacker(board, r, c, color, type, out) {
    if (!inBounds(r, c)) return;
    const p = board[r][c];
    if (p && p.color === color && p.type === type) {
      out.push({ row: r, col: c, type: p.type });
    }
  }

  function slideAttackers(board, row, col, dirs, color, types, out) {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === color && types.includes(p.type)) {
            out.push({ row: r, col: c, type: p.type });
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  function leastValuableAttacker(attackers) {
    if (!attackers.length) return null;
    let min = attackers[0];
    for (const a of attackers) {
      if (PIECE_VALUES[a.type] < PIECE_VALUES[min.type]) min = a;
    }
    return min;
  }

  function seeRecursive(board, row, col, sideToMove, depth) {
    depth = depth || 0;
    if (depth > 32) return 0;

    const attackers = findAttackers(board, row, col, sideToMove);
    if (!attackers.length) return 0;

    const attacker = leastValuableAttacker(attackers);
    const occupant = board[row][col];
    const capturedValue = occupant ? PIECE_VALUES[occupant.type] : 0;

    const nextBoard = cloneBoard(board);
    nextBoard[row][col] = { type: attacker.type, color: sideToMove };
    nextBoard[attacker.row][attacker.col] = null;

    const opponent = sideToMove === 'w' ? 'b' : 'w';
    const continuation = seeRecursive(nextBoard, row, col, opponent, depth + 1);

    const net = capturedValue - continuation;
    return Math.max(0, net);
  }

  function findLostDefenderIssues(boardBefore, boardAfter, fromRC, toRC, moverColor, opponentColor) {
    const issues = [];
    const coverage = getCoverageSquares(boardBefore, fromRC.row, fromRC.col);

    for (const sq of coverage) {
      if (sq.row === toRC.row && sq.col === toRC.col) continue;

      const beforePiece = boardBefore[sq.row][sq.col];
      if (!beforePiece || beforePiece.color !== moverColor) continue;

      const afterPiece = boardAfter[sq.row][sq.col];
      if (!afterPiece || afterPiece.color !== moverColor || afterPiece.type !== beforePiece.type) continue;

      const seeBefore = seeRecursive(boardBefore, sq.row, sq.col, opponentColor);
      const seeAfter = seeRecursive(boardAfter, sq.row, sq.col, opponentColor);

      if (seeBefore <= SAFE_THRESHOLD && seeAfter > HANG_THRESHOLD) {
        issues.push({
          type: 'lost_defender',
          square: rowColToSquare(sq.row, sq.col),
          pieceType: afterPiece.type,
          materialAtRisk: seeAfter,
          attackers: findAttackers(boardAfter, sq.row, sq.col, opponentColor)
        });
      }
    }

    issues.sort((a, b) => b.materialAtRisk - a.materialAtRisk);
    return issues;
  }

  function findHangsAfterMove(boardAfter, toRC, moverPieceType, opponentColor, playedMove) {
    const seeAfter = seeRecursive(boardAfter, toRC.row, toRC.col, opponentColor);
    
    let netLoss = seeAfter;
    if (playedMove && playedMove.captured) {
      const capturedVal = PIECE_VALUES[playedMove.captured] || 0;
      netLoss = seeAfter - capturedVal;
    }

    if (netLoss > HANG_THRESHOLD) {
      return {
        type: 'hangs_after_move',
        square: rowColToSquare(toRC.row, toRC.col),
        pieceType: moverPieceType,
        materialAtRisk: netLoss,
        attackers: findAttackers(boardAfter, toRC.row, toRC.col, opponentColor)
      };
    }
    return null;
  }

  function findIgnoredThreats(boardBefore, boardAfter, fromRC, moverColor, opponentColor) {
    const issues = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row === fromRC.row && col === fromRC.col) continue;
        const p = boardBefore[row][col];
        if (!p || p.color !== moverColor) continue;

        const seeBefore = seeRecursive(boardBefore, row, col, opponentColor);
        if (seeBefore <= SAFE_THRESHOLD) continue;

        const after = boardAfter[row][col];
        if (!after || after.color !== moverColor || after.type !== p.type) continue;

        const seeAfter = seeRecursive(boardAfter, row, col, opponentColor);
        if (seeAfter > HANG_THRESHOLD) {
          issues.push({
            type: 'ignored_threat',
            square: rowColToSquare(row, col),
            pieceType: p.type,
            materialAtRisk: seeAfter,
            attackers: findAttackers(boardAfter, row, col, opponentColor)
          });
        }
      }
    }
    issues.sort((a, b) => b.materialAtRisk - a.materialAtRisk);
    return issues;
  }

  function findForkThreats(boardAfter, moverColor, opponentColor) {
    const issues = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = boardAfter[row][col];
        if (!piece || piece.color !== opponentColor || piece.type !== 'n') continue;

        const coverage = getCoverageSquares(boardAfter, row, col);
        const targets = coverage
          .map(sq => ({ sq, piece: boardAfter[sq.row][sq.col] }))
          .filter(t => t.piece && t.piece.color === moverColor && t.piece.type !== 'p');

        if (targets.length >= 2) {
          issues.push({
            type: 'fork',
            square: rowColToSquare(row, col),
            pieceType: 'n',
            targets: targets.map(t => ({
              square: rowColToSquare(t.sq.row, t.sq.col),
              type: t.piece.type
            }))
          });
        }
      }
    }
    return issues;
  }

  function getChessCtor(override) {
    if (override) return override;
    if (typeof Chess !== 'undefined') return Chess;
    if (typeof window !== 'undefined' && window.Chess) return window.Chess;
    if (typeof global !== 'undefined' && global.Chess) return global.Chess;
    return null;
  }

  function adaptChessInstance(instance) {
    return {
      moves: opts => instance.moves(opts),
      move: m => instance.move(m),
      undo: () => instance.undo(),
      fen: () => instance.fen(),
      isCheckmate: () =>
        typeof instance.isCheckmate === 'function' ? instance.isCheckmate() : instance.in_checkmate()
    };
  }

  function safeLegalMoves(adapter) {
    try {
      const moves = adapter.moves({ verbose: true });
      return Array.isArray(moves) ? moves : [];
    } catch (e) {
      return [];
    }
  }

  function findMissedCheckmate(ChessCtor, fenBefore, playedMove) {
    if (!ChessCtor) return null;
    let probe;
    try {
      probe = new ChessCtor(fenBefore);
    } catch (e) {
      return null;
    }
    const adapter = adaptChessInstance(probe);
    const legalMoves = safeLegalMoves(adapter);
    if (!legalMoves.length) return null;

    const mates = [];
    for (const m of legalMoves) {
      try {
        const made = adapter.move(m.san);
        if (made) {
          if (adapter.isCheckmate()) mates.push(m.san);
          adapter.undo();
        }
      } catch (e) {
        try {
          adapter.undo();
        } catch (e2) {
          /* ignore */
        }
      }
    }

    if (!mates.length || mates.includes(playedMove.san)) return null;

    return { type: 'missed_checkmate', mateMoves: mates };
  }

  function findBlunderedCheckmate(ChessCtor, fenAfter) {
    if (!ChessCtor) return null;
    let probe;
    try {
      probe = new ChessCtor(fenAfter);
    } catch (e) {
      return null;
    }
    const adapter = adaptChessInstance(probe);
    if (adapter.isCheckmate()) return null;

    const legalMoves = safeLegalMoves(adapter);
    for (const m of legalMoves) {
      try {
        const made = adapter.move(m.san);
        if (made) {
          const isMate = adapter.isCheckmate();
          adapter.undo();
          if (isMate) return { type: 'blundered_checkmate', mateMove: m.san };
        }
      } catch (e) {
        try {
          adapter.undo();
        } catch (e2) {
          /* ignore */
        }
      }
    }
    return null;
  }

  function findMissedFreeCapture(ChessCtor, fenBefore, fenAfter, playedMove, opponentColor) {
    if (!ChessCtor) return null;
    let probe;
    try {
      probe = new ChessCtor(fenBefore);
    } catch (e) {
      return null;
    }
    const adapter = adaptChessInstance(probe);
    const legalMoves = safeLegalMoves(adapter);
    if (!legalMoves.length) return null;

    let best = null;

    for (const m of legalMoves) {
      if (!m.captured) continue;
      let resultFen;
      try {
        const made = adapter.move(m.san);
        if (!made) continue;
        resultFen = adapter.fen();
        adapter.undo();
      } catch (e) {
        try {
          adapter.undo();
        } catch (e2) {
          /* ignore */
        }
        continue;
      }

      let resultBoard;
      try {
        resultBoard = parseFenBoard(resultFen);
      } catch (e) {
        continue;
      }

      const destRC = squareToRowCol(m.to);
      const capturedValue = PIECE_VALUES[m.captured] || 0;
      const recapture = seeRecursive(resultBoard, destRC.row, destRC.col, opponentColor);
      const netGain = capturedValue - recapture;

      if (!best || netGain > best.netGain) {
        best = { san: m.san, from: m.from, to: m.to, capturedType: m.captured, netGain };
      }
    }

    if (!best || best.netGain < FREE_CAPTURE_THRESHOLD) return null;

    let playedNetGain = 0;
    if (playedMove.captured) {
      try {
        const boardAfter = parseFenBoard(fenAfter);
        const playedRC = squareToRowCol(playedMove.to);
        const playedCapturedValue = PIECE_VALUES[playedMove.captured] || 0;
        playedNetGain = playedCapturedValue - seeRecursive(boardAfter, playedRC.row, playedRC.col, opponentColor);
      } catch (e) {
        playedNetGain = 0;
      }
    }

    if (best.netGain - playedNetGain < FREE_CAPTURE_MARGIN) return null;

    return {
      type: 'missed_free_capture',
      square: best.to,
      fromSquare: best.from,
      pieceType: best.capturedType,
      materialMissed: best.netGain,
      sanSuggestion: best.san
    };
  }

  function findBlunderedWin(evalBeforeCp, evalAfterCp, moverColor) {
    if (typeof evalBeforeCp !== 'number' || typeof evalAfterCp !== 'number') return null;
    const sign = moverColor === 'w' ? 1 : -1;
    const moverEvalBefore = sign * evalBeforeCp;
    const moverEvalAfter = sign * evalAfterCp;

    if (moverEvalBefore >= WINNING_EVAL_THRESHOLD && moverEvalAfter <= DRAWISH_EVAL_THRESHOLD) {
      return { type: 'blundered_win', evalBefore: moverEvalBefore, evalAfter: moverEvalAfter };
    }
    return null;
  }

  function classifyGrade(cpLoss, isBestMove, materialAtRisk, thresholds) {
    if (isBestMove) return 'best';

    if (typeof cpLoss === 'number' && !Number.isNaN(cpLoss)) {
      if (cpLoss <= thresholds.good) return 'good';
      if (cpLoss <= thresholds.inaccuracy) return 'inaccuracy';
      if (cpLoss <= thresholds.mistake) return 'mistake';
      return 'blunder';
    }

    if (materialAtRisk >= 3) return 'blunder';
    if (materialAtRisk >= 1) return 'mistake';
    if (materialAtRisk > 0) return 'inaccuracy';
    return 'good';
  }

  function describeAttackers(attackers) {
    if (!attackers || !attackers.length) return 'your opponent';
    const names = attackers.map(a => 'the ' + PIECE_NAMES[a.type]);
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function blunderedWinSuffix(blunderedWin) {
    if (!blunderedWin) return '';
    const beforePawns = (blunderedWin.evalBefore / 100).toFixed(1);
    const afterPawns = (blunderedWin.evalAfter / 100).toFixed(1);
    const fellBehind = blunderedWin.evalAfter < -DRAWISH_EVAL_THRESHOLD;
    return (
      ' On top of that, you were winning by roughly ' + beforePawns + ' pawns of evaluation before this move, and ' +
      (fellBehind
        ? "you've now actually fallen behind (around " + afterPawns + ').'
        : "it's dropped to roughly equal (around " + afterPawns + ').')
    );
  }

  function buildExplanation(grade, issue, ctx) {
    const moverPieceName = PIECE_NAMES[ctx.move.piece] || 'piece';
    let text = '';

    const historyIndex = typeof window !== 'undefined' ? window.currentHistoryIndex : 0;
    
    let movedSamePieceRepeatedly = false;
    if (historyIndex < 20 && historyIndex >= 4 && typeof window !== 'undefined') {
      const prevMove = window.recordedMoves[historyIndex - 3];
      if (prevMove && lastMovePieceMatches(prevMove, ctx.move.piece)) {
        movedSamePieceRepeatedly = true;
      }
    }

    const developedQueenEarly = historyIndex < 12 && ctx.move.piece === 'q';

    let blockedOwnPieces = false;
    if (ctx.move.piece === 'p' && (ctx.move.to === 'd3' || ctx.move.to === 'e3' || ctx.move.to === 'd6' || ctx.move.to === 'e6')) {
      blockedOwnPieces = true;
    }

    if (grade === 'forced' || ctx.isForcedMove) {
      return 'This was a forced move—it was the only legal option available to escape check or resolve the position.';
    }

    const isGoodMove = (grade === 'best' || grade === 'good');
    const isMoverLosing = ctx.moverEvalBefore < -200;
    const isCapture = !!(ctx.move && ctx.move.captured);

    if (issue) {
      switch (issue.type) {
        case 'blundered_checkmate':
          text = 'This allows checkmate next move (' + issue.mateMove + ") -- there's no way to stop it.";
          break;

        case 'missed_checkmate':
          text = 'You had a forced checkmate on the board (' + issue.mateMoves[0] + ') and ' + ctx.move.san + " doesn't take it -- missing checkmate and letting the game continue.";
          break;

        case 'missed_free_capture':
          const materialName = PIECE_NAMES[issue.pieceType] || 'piece';
          if (issue.pieceType === 'q') {
            text = 'You missed a queen win! You had a clean capture available with ' + issue.sanSuggestion + ' to win their queen.';
          } else if (issue.pieceType === 'r') {
            text = 'You missed a rook win. Play ' + issue.sanSuggestion + ' to capture their rook for free.';
          } else {
            text = 'You missed a piece win. You could have won a free ' + materialName + ' with ' + issue.sanSuggestion + '.';
          }
          break;

        case 'lost_defender':
          if (isGoodMove && !isMoverLosing) {
            if (isCapture) {
              text = 'A clean trade! You sacrificed the defense of your piece on ' + issue.square + ' to secure an active capture and maintain dynamic balance.';
            } else {
              text = 'A calculated transition. You ignored the defense of your piece on ' + issue.square + ' to relocate your ' + moverPieceName + ' to a more active square.';
            }
          } else {
            const defPieceType = issue.pieceType;
            if (defPieceType === 'q') {
              text = 'You left your queen hanging on ' + issue.square + ' -- your ' + moverPieceName + ' on ' + ctx.move.from + ' was defending her, and moving it left her undefended.';
            } else if (defPieceType === 'r') {
              text = 'You left your rook hanging on ' + issue.square + ', allowing your opponent to capture it because your defending piece moved away.';
            } else {
              text = 'You left your ' + PIECE_NAMES[defPieceType] + ' hanging on ' + issue.square + ' -- moving your ' + moverPieceName + ' away stripped its key defender.';
            }
          }
          break;

        case 'hangs_after_move':
          if (isGoodMove && !isMoverLosing) {
            if (isCapture) {
              text = 'A favorable capture trade! Even though your ' + moverPieceName + ' on ' + issue.square + ' is vulnerable, the captured material compensates for it.';
            } else {
              text = 'A strategic positioning choice. Even though your ' + moverPieceName + ' on ' + issue.square + ' looks vulnerable, the positional placement aligns with your plan.';
            }
          } else {
            const targetType = issue.pieceType;
            if (targetType === 'q') {
              text = 'You blundered and lost your queen on ' + issue.square + '. Moving her there leaves her completely undefended.';
            } else if (targetType === 'r') {
              text = 'You allowed rook loss by placing your rook on ' + issue.square + ' where it is hanging essentially for free.';
            } else {
              text = 'You allowed piece loss by placing your ' + PIECE_NAMES[targetType] + ' on ' + issue.square + ' undefended, letting ' + describeAttackers(issue.attackers) + ' win material.';
            }
          }
          break;

        case 'ignored_threat':
          if (isGoodMove && !isMoverLosing) {
            if (isCapture) {
              text = 'A sharp tactical trade! You ignored the threat to your piece on ' + issue.square + ' to capture active material elsewhere.';
            } else if (ctx.move.piece === 'k') {
              text = 'A defensive relocation. You chose to ignore the threat to your piece on ' + issue.square + ' to prioritize your king safety and reposition your king.';
            } else {
              text = 'A calculated decision. You chose to ignore the threat to your piece on ' + issue.square + ' to prioritize other active pieces or positional developments.';
            }
          } else {
            const threatenedType = issue.pieceType;
            if (threatenedType === 'q') {
              text = 'Your queen on ' + issue.square + ' was under attack, and ' + ctx.move.san + ' ignored the threat -- allowing queen loss on the next turn.';
            } else if (threatenedType === 'r') {
              text = 'Your rook on ' + issue.square + ' was hanging, and ' + ctx.move.san + ' allowed rook loss instead of defending it.';
            } else {
              text = 'Your ' + PIECE_NAMES[threatenedType] + ' on ' + issue.square + ' was already hanging, and this move allowed piece loss by ignoring the threat.';
            }
          }
          break;

        case 'fork':
          text = 'This allows the knight on ' + issue.square + ' to fork your ' +
            issue.targets.map(t => PIECE_NAMES[t.type] + ' on ' + t.square).join(' and ') +
            ' -- you allowed a fork and will lose material no matter which piece you defend.';
          break;
      }
    }

    if (!text) {
      switch (grade) {
        case 'best':
          text = "This matches the engine's top choice in this position.";
          break;
        case 'good':
          if (ctx.bestMoveSan) {
            text = 'A solid, safe move. ' + ctx.bestMoveSan + ' was a touch more precise, but your position remains steady.';
          } else {
            text = 'A solid, safe move -- nothing is hanging and your position remains steady.';
          }
          break;
        case 'inaccuracy':
          if (blockedOwnPieces) {
            text = 'This move blocked your own pieces, restricting your bishops\' active diagonals and reducing piece activity.';
          } else {
            text = 'A generic inaccuracy. You missed a stronger continuation and gave up central control, losing a bit of tempo.';
          }
          break;
        case 'mistake':
          if (developedQueenEarly) {
            text = 'You developed your queen too early in the game, making her an easy target and delaying your minor pieces.';
          } else if (movedSamePieceRepeatedly) {
            text = 'You moved the same piece repeatedly in the opening, delaying development.';
          } else {
            text = 'This was a mistake. It allowed strong counterplay and entered an unfavorable trade, reducing your winning chances.';
          }
          break;
        case 'blunder':
          text = 'Blunder! This weakens king safety and opens up your king shield pawn positioning, drastically increasing your losing chances.';
          break;
      }
    }

    if (ctx.blunderedWin && (!issue || issue.type !== 'blundered_checkmate')) {
      text += blunderedWinSuffix(ctx.blunderedWin);
    }

    if ((grade === 'inaccuracy' || grade === 'mistake' || grade === 'blunder') && ctx.bestMoveSan) {
      text += ` The best move in this position was ${ctx.bestMoveSan}.`;
    }

    return text;
  }

  function lastMovePieceMatches(prevSan, currentPieceType) {
    if (!prevSan || !currentPieceType) return false;
    const cleanPrev = prevSan.replace(/[+#x=]/g, '');
    const firstChar = cleanPrev.charAt(0);
    const targetChar = currentPieceType.toUpperCase();
    if (targetChar === 'P' && (firstChar >= 'a' && firstChar <= 'h')) return true;
    return firstChar === targetChar;
  }

  function review(options) {
    const {
      fenBefore,
      fenAfter,
      move,
      cpLoss,
      isEngineBestMove = false,
      bestMoveSan,
      evalBeforeCp,
      evalAfterCp,
      ChessCtor: chessCtorOverride,
      thresholds = DEFAULT_THRESHOLDS
    } = options || {};

    if (!fenBefore || !fenAfter || !move || !move.from || !move.to || !move.piece || !move.color) {
      throw new Error('chess-review: review() requires fenBefore, fenAfter, and a move object with from/to/piece/color.');
    }

    const ChessCtor = getChessCtor(chessCtorOverride);
    
    let isForcedMove = false;
    if (ChessCtor) {
      try {
        const probe = new ChessCtor(fenBefore);
        const adapter = adaptChessInstance(probe);
        const legalMoves = safeLegalMoves(adapter);
        if (legalMoves.length === 1) {
          isForcedMove = true;
        }
      } catch (e) {}
    }

    const boardBefore = parseFenBoard(fenBefore);
    const boardAfter = parseFenBoard(fenAfter);

    let activeThresholds = Object.assign({}, thresholds);

    const moverColor = move.color;
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const fromRC = squareToRowCol(move.from);
    const toRC = squareToRowCol(move.to);

    const lostDefenderIssues = findLostDefenderIssues(boardBefore, boardAfter, fromRC, toRC, moverColor, opponentColor);
    const hangsAfterMove = findHangsAfterMove(boardAfter, toRC, move.promotion || move.piece, opponentColor, move);
    const ignoredThreats = findIgnoredThreats(boardBefore, boardAfter, fromRC, moverColor, opponentColor);
    const forkThreats = findForkThreats(boardAfter, moverColor, opponentColor);

    const materialIssues = []
      .concat(lostDefenderIssues)
      .concat(hangsAfterMove ? [hangsAfterMove] : [])
      .concat(ignoredThreats)
      .concat(forkThreats.map(f => Object.assign({ materialAtRisk: 3 }, f)));

    let materialIssue = null;
    if (materialIssues.length) {
      const priorityRank = { lost_defender: 0, hangs_after_move: 1, ignored_threat: 2, fork: 3 };
      materialIssues.sort((a, b) => {
        const diff = (b.materialAtRisk || 0) - (a.materialAtRisk || 0);
        if (Math.abs(diff) > 0.01) return diff;
        return priorityRank[a.type] - priorityRank[b.type];
      });
      materialIssue = materialIssues[0];
    }

    const blunderedMate = findBlunderedCheckmate(ChessCtor, fenAfter);
    const missedMate = findMissedCheckmate(ChessCtor, fenBefore, move);
    const missedCapture = findMissedFreeCapture(ChessCtor, fenBefore, fenAfter, move, opponentColor);
    const blunderedWin = findBlunderedWin(evalBeforeCp, evalAfterCp, moverColor);

    let primaryIssue = null;
    let candidates = [];

    if (blunderedMate) {
      candidates.push({ issue: blunderedMate, score: 10000 });
    }
    if (missedMate) {
      candidates.push({ issue: missedMate, score: 9000 });
    }
    if (blunderedWin) {
      candidates.push({ issue: blunderedWin, score: 8000 });
    }
    if (materialIssue) {
      const pieceVal = materialIssue.materialAtRisk || 0;
      candidates.push({ issue: materialIssue, score: pieceVal * 1000 });
    }
    if (missedCapture) {
      const pieceVal = missedCapture.materialMissed || 0;
      candidates.push({ issue: missedCapture, score: pieceVal * 950 });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      primaryIssue = candidates[0].issue;
    }

    const materialAtRisk = materialIssue ? materialIssue.materialAtRisk || 0 : 0;
    
    let grade = isForcedMove ? 'forced' : (blunderedMate ? 'blunder' : classifyGrade(cpLoss, isEngineBestMove, materialAtRisk, activeThresholds));

    const sign = moverColor === 'w' ? 1 : -1;
    const moverEvalBefore = typeof evalBeforeCp === 'number' ? (sign * evalBeforeCp) : 0;
    const moverEvalAfter = typeof evalAfterCp === 'number' ? (sign * evalAfterCp) : 0;

    const hasUnfavorableEval = moverEvalAfter < -100;

    if (!blunderedMate && !isForcedMove) {
      if (missedMate && (grade === 'best' || grade === 'good')) grade = 'mistake';
      if (missedCapture && (grade === 'best' || grade === 'good')) {
        grade = missedCapture.materialMissed >= 3 ? 'mistake' : 'inaccuracy';
      }

      const isEndgamePosition = isEndgame(boardBefore);
      if (!isEndgamePosition) {
        const isTradeSound = typeof cpLoss === 'number' && cpLoss <= activeThresholds.good;
        const allowOverride = !isEngineBestMove || (hasUnfavorableEval && !isTradeSound);

        if (allowOverride) {
          if (materialAtRisk >= 5 && (grade === 'best' || grade === 'good' || grade === 'inaccuracy' || grade === 'forced')) {
            grade = 'blunder';
          } else if (materialAtRisk >= 3 && (grade === 'best' || grade === 'good' || grade === 'inaccuracy' || grade === 'forced')) {
            grade = 'mistake';
          } else if (materialAtRisk >= 1 && (grade === 'best' || grade === 'good')) {
            grade = 'inaccuracy'; // Fixed "grid" variable typo to "grade"
          }
        }
      }
    }

    const ctx = { move, cpLoss, bestMoveSan, blunderedWin, isForcedMove, moverEvalBefore };
    const explanation = buildExplanation(grade, primaryIssue, ctx);

    return {
      grade,
      badge: BADGES[grade],
      headline: HEADLINES[grade],
      explanation,
      details: {
        primaryIssue,
        allIssues: candidates.map(c => c.issue),
        materialAtRisk,
        blunderedCheckmate: blunderedMate,
        missedCheckmate: missedMate,
        missedFreeCapture: missedCapture,
        blunderedWin,
        isForcedMove,
        cpLoss: typeof cpLoss === 'number' ? cpLoss : null,
        isEngineBestMove: !!isEngineBestMove,
        bestMoveSan: bestMoveSan || null,
        chessJsAvailable: !!ChessCtor
      }
    };
  }

  const ChessReview = {
    review,
    _internal: {
      parseFenBoard,
      squareToRowCol,
      rowColToSquare,
      findAttackers,
      getCoverageSquares,
      seeRecursive,
      classifyGrade,
      getChessCtor,
      findMissedCheckmate,
      findBlunderedCheckmate,
      findMissedFreeCapture,
      findBlunderedWin
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChessReview;
  } else {
    global.ChessReview = ChessReview;
  }
  
  function convertUciToSan(fen, uci) {
    if (!uci || uci === '(none)') return null;
    try {
      const temp = new Chess(fen);
      const move = temp.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.charAt(4) : undefined
      });
      return move ? move.san : null;
    } catch (e) {
      return null;
    }
  }

  function evaluatePositionSync(fen, depth) {
    return new Promise(resolve => {
      if (window.engineIsMock || !window.stockfish) {
        setTimeout(resolve, 100);
        return;
      }

      window.stockfish.postMessage('stop');

      setTimeout(() => {
        if (!window.stockfish) {
          resolve();
          return;
        }

        window.isFirstLineForCurrentPosition = true;
        let resolved = false;

        const safetyTimeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (window.stockfish) {
              window.stockfish.removeEventListener('message', listener);
            }
            resolve();
          }
        }, 3000);

        const listener = (e) => {
          const data = e.data;
          if (data.startsWith('info')) {
            parseUciInfoLocal(data, fen);
          }
          if (data.startsWith('bestmove')) {
            if (!resolved) {
              resolved = true;
              clearTimeout(safetyTimeout);
              
              const tokens = data.split(' ');
              const bestMoveUci = tokens[1];
              if (bestMoveUci && bestMoveUci !== '(none)') {
                window.bestMoveCache[fen] = bestMoveUci;
              }

              if (window.stockfish) {
                window.stockfish.removeEventListener('message', listener);
              }
              resolve();
            }
          }
        };

        window.stockfish.addEventListener('message', listener);
        window.stockfish.postMessage(`position fen ${fen}`);
        window.stockfish.postMessage(`go depth ${depth}`);
      }, 50);
    });
  }

  function parseUciInfoLocal(msg, fen) {
    const tokens = msg.split(' ');

    const depthIdx = tokens.indexOf('depth');
    if (depthIdx !== -1) {
      const currentDepth = parseInt(tokens[depthIdx + 1], 10);
      const depthDisplay = document.getElementById('coach-depth-display');
      if (depthDisplay && window.currentHistoryIndex === window.fenHistory.indexOf(fen)) {
        depthDisplay.innerText = currentDepth;
      }
    }

    const scoreIdx = tokens.indexOf('score');
    if (scoreIdx === -1) return;

    const scoreType = tokens[scoreIdx + 1];
    let value = parseInt(tokens[scoreIdx + 2], 10);

    const parts = fen.split(' ');
    const activeSearchTurn = parts[1] || 'w';

    if (activeSearchTurn === 'b') {
      value = -value;
    }

    let parsedCp = 0;
    if (scoreType === 'mate') {
      const absVal = Math.abs(value);
      const sign = value >= 0 ? 1 : -1;
      parsedCp = sign * (10000 - absVal);
    } else {
      parsedCp = value;
    }

    window.evaluatedScores[fen] = parsedCp;
  }

  async function runReviewPass() {
    const totalSteps = window.fenHistory.length;
    const textEl = document.getElementById('coach-explanation-text');
    const classificationEl = document.getElementById('coach-move-classification');
    
    if (!textEl || !classificationEl) return;

    if (totalSteps <= 1) {
      classificationEl.innerText = "NO MOVES";
      classificationEl.className = "text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200 uppercase";
      textEl.innerHTML = `"Please play or load a game before running the coach analysis."`;
      return;
    }

    window.evaluatedScores = {};
    window.bestMoveCache = {};

    window.isReviewActive = false;
    await new Promise(resolve => setTimeout(resolve, 50));

    window.isReviewActive = true;

    if (window.stockfish) {
      window.stockfish.postMessage('stop');
    }

    if (!window.engineActive) {
      toggleEngine();
    }

    classificationEl.innerText = "ANALYZING OPENING";
    classificationEl.className = "text-[9px] font-mono bg-cyan-50 px-1.5 py-0.5 rounded text-cyan-600 border border-cyan-200 animate-pulse uppercase";
    textEl.innerHTML = `"Reviewing the opening moves... Let's identify your structure."`;

    const fastPhases = Math.min(6, totalSteps - 1);
    for (let step = 0; step <= fastPhases; step++) {
      if (!window.isReviewActive || window.fenHistory.length !== totalSteps) return;

      const currentFen = window.fenHistory[step];
      if (window.evaluatedScores[currentFen] === undefined) {
        const depthDisplay = document.getElementById('coach-depth-display');
        if (depthDisplay) depthDisplay.innerText = "0";

        await evaluatePositionSync(currentFen, 12);
      }
    }

    classificationEl.innerText = "COMPLETE";
    classificationEl.className = "text-[9px] font-mono bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-600 border border-emerald-200 uppercase";
    
    const startMoveIndex = Math.min(1, totalSteps - 1);
    syncRulesEngineToHistoryIndex(startMoveIndex);
    updateCoachExplanations();

    (async () => {
      for (let step = fastPhases + 1; step < totalSteps; step++) {
        if (!window.isReviewActive || window.fenHistory.length !== totalSteps) {
          break;
        }

        const currentFen = window.fenHistory[step];
        if (window.evaluatedScores[currentFen] === undefined) {
          const depthDisplay = document.getElementById('coach-depth-display');
          if (depthDisplay) depthDisplay.innerText = "0";

          await evaluatePositionSync(currentFen, 12);
        }

        if (window.currentHistoryIndex === step) {
          updateCoachExplanations();
        }
      }

      window.isReviewActive = false;

      const svg = document.getElementById('board-arrows');
      if (svg) $(svg).find('path.arrow-path').remove();

      if (window.engineActive && typeof updateEnginePosition === 'function') {
          updateEnginePosition();
      }
    })();
  }

  function updateCoachExplanations() {
    const coachBox = document.getElementById('coach-box');
    const classificationEl = document.getElementById('coach-move-classification');
    const textEl = document.getElementById('coach-explanation-text');
    
    if (!coachBox || coachBox.classList.contains('hidden') || !textEl || !classificationEl) return;

    if (window.currentHistoryIndex <= 0) {
      classificationEl.innerText = "START POSITION";
      classificationEl.className = "text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200 uppercase";
      textEl.innerHTML = `"Let's begin! Step through the move timeline to see real-time coaching feedback."`;
      return;
    }

    const lastMove = getLastMoveDetails();
    if (!lastMove) return;

    if (window.game && window.game.in_checkmate()) {
      classificationEl.innerText = "CHECKMATE";
      classificationEl.className = "text-[9px] font-mono bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-600 border border-emerald-200 uppercase font-bold";
      textEl.innerHTML = `"Checkmate! An absolute nail in the coffin to end the game. Outstanding tactical awareness."`;
      return;
    }

    const priorFen = window.fenHistory[window.currentHistoryIndex - 1];
    const currentFen = window.fenHistory[window.currentHistoryIndex];

    const priorScore = window.evaluatedScores[priorFen];
    const currentScore = window.evaluatedScores[currentFen];

    if (priorScore === undefined || currentScore === undefined) {
      classificationEl.innerText = "CALCULATING";
      classificationEl.className = "text-[9px] font-mono bg-cyan-50 px-1.5 py-0.5 rounded text-cyan-600 border border-cyan-200 animate-pulse uppercase";
      textEl.innerHTML = `"I am scanning this position... Let me complete calculations to provide precise feedback."`;
      return;
    }

    const parts = priorFen.split(' ');
    const priorTurn = parts[1] || 'w';
    const isWhiteTurn = (priorTurn === 'w');

    const priorPlayerScore = isWhiteTurn ? priorScore : -priorScore;
    const currentPlayerScore = isWhiteTurn ? currentScore : -currentScore;

    let cpl = priorPlayerScore - currentPlayerScore;
    if (cpl < 0) cpl = 0;

    let isBook = false;
    let openingName = "";
    if (typeof getBookMovesAndOpenings === 'function') {
      const priorBookMoves = getBookMovesAndOpenings(window.currentHistoryIndex - 1);
      const playedSanClean = lastMove.san.replace(/[+#x=]/g, '');
      const match = Object.keys(priorBookMoves).find(bm => {
        return bm.replace(/[+#x=]/g, '') === playedSanClean;
      });
      if (match) {
        isBook = true;
        if (priorBookMoves[match] && priorBookMoves[match].length > 0) {
          openingName = priorBookMoves[match][0].name;
        }
      }
    }

    const activeFen = window.fenHistory[window.currentHistoryIndex];
    const activeBestMoveUci = window.bestMoveCache[activeFen];
    if (typeof window.drawCoachArrow === 'function') {
      window.drawCoachArrow(activeBestMoveUci);
    }

    if (isBook) {
      classificationEl.innerText = "OPENING CHOICE";
      classificationEl.className = "text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase text-cyan-600 bg-cyan-50 border-cyan-200";
      textEl.innerHTML = `"Nice opening choice! You opted for the standard moves of the ${openingName || 'theoretical opening'}. Let's see how the game develops from here."`;
      return;
    }

    const bestMoveUci = window.bestMoveCache[priorFen];
    const bestMoveSan = convertUciToSan(priorFen, bestMoveUci);
    const playedUci = lastMove.from + lastMove.to + (lastMove.promotion || '');
    const isBest = (playedUci === bestMoveUci);

    const reviewResult = ChessReview.review({
      fenBefore: priorFen,
      fenAfter: currentFen,
      move: lastMove,
      cpLoss: cpl,
      isEngineBestMove: isBest,
      bestMoveSan: bestMoveSan || null,
      evalBeforeCp: priorScore,
      evalAfterCp: currentScore
    });

    let colorClass = "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (reviewResult.grade === 'best') colorClass = "text-cyan-600 bg-cyan-50 border-cyan-200 font-bold";
    else if (reviewResult.grade === 'forced') colorClass = "text-slate-500 bg-slate-100 border-slate-200 font-bold";
    else if (reviewResult.grade === 'good') colorClass = "text-emerald-600 bg-emerald-50 border-emerald-200";
    else if (reviewResult.grade === 'inaccuracy') colorClass = "text-yellow-600 bg-yellow-50 border-yellow-200";
    else if (reviewResult.grade === 'mistake') colorClass = "text-amber-600 bg-amber-50 border-amber-200 font-semibold";
    else if (reviewResult.grade === 'blunder') colorClass = "text-rose-600 bg-rose-50 border-rose-200 font-bold";

    classificationEl.innerText = reviewResult.headline;
    classificationEl.className = `text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${colorClass}`;
    textEl.innerHTML = `"${reviewResult.explanation}"`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const analyseBtn = document.getElementById('analyse-game-btn');
    const coachBox = document.getElementById('coach-box');
    const closeCoachBtn = document.getElementById('close-coach-btn');

    if (analyseBtn && coachBox) {
      analyseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const isHidden = coachBox.classList.contains('hidden');
        if (isHidden) {
          coachBox.classList.remove('hidden');
          runReviewPass();
        } else {
          coachBox.classList.add('hidden');
          window.isReviewActive = false;

          const svg = document.getElementById('board-arrows');
          if (svg) $(svg).find('path.arrow-path').remove();
        }
      });
    }

    if (closeCoachBtn && coachBox) {
      closeCoachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        coachBox.classList.add('hidden');
        window.isReviewActive = false;

        const svg = document.getElementById('board-arrows');
        if (svg) $(svg).find('path.arrow-path').remove();
      });
    }
  });

  window.updateCoachExplanations = updateCoachExplanations;
  window.runReviewPass = runReviewPass;
  window.evaluatePositionSync = evaluatePositionSync;
  window.convertUciToSan = convertUciToSan;
})(typeof window !== 'undefined' ? window : globalThis);