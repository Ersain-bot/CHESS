// script.js
const boardElement = document.getElementById('board');
const evalScoreElement = document.getElementById('eval-score');
const evalBarFill = document.getElementById('eval-bar-fill');
const fenInput = document.getElementById('fen-input');
const pgnInput = document.getElementById('pgn-input');
const linesElements = [
    document.getElementById('line-1'),
    document.getElementById('line-2'),
    document.getElementById('line-3')
];

let board = null;
const game = new Chess();
let engineWorker = null;
let currentDepth = 15;

// Инициализация шахматной доски
const config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};
board = Chessboard('board', config);

// Загрузка Stockfish через Blob для обхода CORS (Live Server / локальные файлы)
fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js')
    .then(response => response.text())
    .then(code => {
        const blob = new Blob([code], { type: 'application/javascript' });
        engineWorker = new Worker(URL.createObjectURL(blob));
        
        engineWorker.onmessage = handleEngineMessage;
        engineWorker.postMessage('uci');
        engineWorker.postMessage('setoption name MultiPV value 3');
        engineWorker.postMessage('isready');
        
        updateBoardState();
    });

function onDragStart(source, piece, position, orientation) {
    if (game.game_over()) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function onDrop(source, target) {
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback';
    updateBoardState();
}

function onSnapEnd() {
    board.position(game.fen());
}

function updateBoardState() {
    const fen = game.fen();
    fenInput.value = fen;
    pgnInput.value = game.pgn();
    analyzePosition(fen);
}

function analyzePosition(fen) {
    if (!engineWorker) return;
    engineWorker.postMessage('stop');
    engineWorker.postMessage(`position fen ${fen}`);
    engineWorker.postMessage(`go depth ${currentDepth}`);
}

function handleEngineMessage(event) {
    const msg = event.data;
    if (msg.startsWith('info depth')) {
        parseEngineInfo(msg);
    }
}

function parseEngineInfo(msg) {
    const multiPvMatch = msg.match(/multipv (\d+)/);
    const scoreCpMatch = msg.match(/score cp (-?\d+)/);
    const scoreMateMatch = msg.match(/score mate (-?\d+)/);
    const pvMatch = msg.match(/pv (.*)/);

    if (!multiPvMatch) return;
    const pvIndex = parseInt(multiPvMatch[1]) - 1;

    let evalText = "";
    let score = 0;

    if (scoreCpMatch) {
        score = parseInt(scoreCpMatch[1]) / 100;
        if (game.turn() === 'b') score = -score; 
        evalText = (score > 0 ? "+" : "") + score.toFixed(2);
    } else if (scoreMateMatch) {
        const mateIn = parseInt(scoreMateMatch[1]);
        score = mateIn > 0 ? 1000 : -1000;
        if (game.turn() === 'b') score = -score;
        evalText = "M" + Math.abs(mateIn);
    }

    if (pvIndex === 0) {
        evalScoreElement.innerText = evalText;
        updateEvalBar(score);
    }

    if (pvMatch && pvIndex < 3) {
        const uciMoves = pvMatch[1];
        const sanMoves = uciToSan(uciMoves, game.fen());
        linesElements[pvIndex].innerText = `[${evalText}] ${sanMoves}`;
    }
}

function updateEvalBar(score) {
    // Score конвертируется в проценты для высоты полоски (от -10 до +10 пешек)
    let percent = 50 + (score / 10) * 50;
    percent = Math.max(0, Math.min(100, percent));
    evalBarFill.style.height = `${percent}%`;
}

// Конвертация UCI (e2e4) движка в SAN (e4) для красивого отображения
function uciToSan(uciStr, startingFen) {
    let tempChess = new Chess(startingFen);
    let moves = uciStr.split(' ').slice(0, 8); // Показываем только первые 8 полуходов
    let sanMoves = [];
    
    let moveNumber = Math.floor((tempChess.history().length / 2) + 1);
    
    for (let move of moves) {
        let from = move.slice(0, 2);
        let to = move.slice(2, 4);
        let promotion = move.length > 4 ? move[4] : undefined;
        
        let isWhite = tempChess.turn() === 'w';
        let result = tempChess.move({from, to, promotion});
        
        if (result) {
            if (isWhite) {
                sanMoves.push(`${moveNumber}. ${result.san}`);
            } else {
                if (sanMoves.length === 0) {
                    sanMoves.push(`${moveNumber}... ${result.san}`);
                } else {
                    sanMoves.push(result.san);
                }
                moveNumber++;
            }
        } else {
            break;
        }
    }
    return sanMoves.join(' ');
}

// Обработчики кнопок
document.getElementById('load-fen-btn').addEventListener('click', () => {
    const fen = fenInput.value;
    if (game.load(fen)) {
        board.position(fen);
        updateBoardState();
    } else {
        alert("Некорректный FEN");
    }
});

document.getElementById('load-pgn-btn').addEventListener('click', () => {
    const pgn = pgnInput.value;
    if (game.load_pgn(pgn)) {
        board.position(game.fen());
        updateBoardState();
    } else {
        alert("Некорректный PGN");
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    game.reset();
    board.start();
    updateBoardState();
});
